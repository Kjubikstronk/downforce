/* Driver portraits from Wikimedia.
 *
 * Wikipedia requires freely-licensed images for living people, so every
 * current driver has a reusable portrait. "Reusable" still means "with
 * attribution", so we record the author and licence for every file we keep and
 * render those credits on the page.
 *
 * Anything whose licence we cannot positively identify as free is skipped. The
 * page falls back to the driver's initials, which is a fine outcome — a missing
 * face is much cheaper than an unlicensed one.
 */

import { writeFile, readFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';

const UA = {
  'user-agent': 'f1page/1.0 (https://github.com/Kjubikstronk/f1page; F1 fan project)',
};

const WIKI = 'https://en.wikipedia.org/w/api.php';
const REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

/* Cards top out around 208px wide, so this covers 2x displays. The originals
   run 960px and ~300KB each, which is roughly six times more image than the
   page can show. */
const THUMB_WIDTH = 420;

/* A handful of Commons portraits are PNGs. Lossless encoding of a photograph
   runs an order of magnitude heavier than the equivalent JPEG — one 500px PNG
   came back at 1.5MB against ~90KB for its neighbours — so anything over budget
   gets re-requested at smaller widths until it fits. Cheaper than taking on an
   image-processing dependency for the two or three files that need it. */
const MAX_BYTES = 200 * 1024;
const FALLBACK_WIDTHS = [320, 240, 200];

/* Wikimedia asks for modest request rates. Two calls per driver, spaced out,
   and only for drivers we haven't already cached. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const POLITE_DELAY = 400;

/* Licences that permit redistribution with attribution. Deliberately a
   allowlist: an unrecognised licence is treated as unusable, not as usable. */
const FREE = [
  /^cc0/i,
  /^cc by(-sa)? \d/i,
  /^public domain/i,
  /^ogl/i,
  /^attribution$/i,
];

function isFree(shortName) {
  if (!shortName) return false;
  if (/non-?free|fair use/i.test(shortName)) return false;
  return FREE.some((re) => re.test(shortName.trim()));
}

const stripTags = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

async function api(params) {
  const url = `${WIKI}?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.info || 'wikipedia API error');
  return json;
}

function firstPage(json) {
  const pages = json?.query?.pages ?? {};
  const key = Object.keys(pages)[0];
  return key ? pages[key] : null;
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/* Find the article's lead image, at a sensible width.
   Two sources, because neither alone covers the grid: `pageimages` misses some
   biographies entirely (Antonelli, Albon), and the REST summary doesn't report
   licensing. */
async function findLeadImage(wikiTitle) {
  let file = null;
  let thumb = null;

  try {
    const page = firstPage(
      await api({
        action: 'query',
        prop: 'pageimages',
        piprop: 'thumbnail|name',
        pithumbsize: String(THUMB_WIDTH),
        titles: wikiTitle,
      })
    );
    file = page?.pageimage ?? null;
    thumb = page?.thumbnail?.source ?? null;
  } catch {
    /* fall through to the REST endpoint */
  }

  if (!thumb) {
    await sleep(POLITE_DELAY);
    const res = await fetch(REST + encodeURIComponent(wikiTitle), { headers: UA });
    if (res.ok) {
      const summary = await res.json();
      const original = summary.originalimage?.source;
      const t = summary.thumbnail?.source;
      // Kept only as a last resort. Rewriting the width in a Commons thumb URL
      // by hand gets rejected; letting the API scale the file is reliable.
      if (t) thumb = t;
      if (!file && original) file = decodeURIComponent(original.split('/').pop());
      if (!file && t) {
        const parts = t.split('/');
        file = decodeURIComponent(parts[parts.length - 2] ?? '');
      }
    }
  }

  return file && thumb ? { file, thumb } : null;
}

/* Resolve one driver: page -> lead image file -> licence + scaled URL. */
async function resolve(wikiTitle) {
  const lead = await findLeadImage(wikiTitle);
  if (!lead) return null;

  await sleep(POLITE_DELAY);

  const filePage = firstPage(
    await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'extmetadata|url|size',
      iiurlwidth: String(THUMB_WIDTH),
      titles: `File:${lead.file}`,
    })
  );

  const info = filePage?.imageinfo?.[0];
  if (!info) return null;

  const meta = info.extmetadata ?? {};
  const licence = meta.LicenseShortName?.value ?? null;

  if (!isFree(licence)) {
    return { skipped: true, licence: licence ?? 'unknown' };
  }

  // thumburl is absent when the original is already at or below our target.
  const scaled =
    info.thumburl ?? (info.width && info.width <= THUMB_WIDTH ? info.url : lead.thumb ?? info.url);

  return {
    url: scaled,
    fileTitle: lead.file,
    descriptionUrl: info.descriptionurl,
    licence,
    licenceUrl: meta.LicenseUrl?.value ?? null,
    author: stripTags(meta.Artist?.value) || 'Unknown author',
  };
}

async function download(url, dest) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`image HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, bytes);
  return bytes.length;
}

async function thumbAt(fileTitle, width) {
  const page = firstPage(
    await api({
      action: 'query',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(width),
      titles: `File:${fileTitle}`,
    })
  );
  return page?.imageinfo?.[0]?.thumburl ?? null;
}

/* Fetch, then shrink until it fits the budget. */
async function downloadWithinBudget(found, dest) {
  let bytes = await download(found.url, dest);
  if (bytes <= MAX_BYTES || !found.fileTitle) return bytes;

  for (const width of FALLBACK_WIDTHS) {
    await sleep(POLITE_DELAY);
    const url = await thumbAt(found.fileTitle, width);
    if (!url) continue;
    bytes = await download(url, dest);
    if (bytes <= MAX_BYTES) break;
  }
  return bytes;
}

/**
 * Ensure a portrait exists on disk for each driver.
 *
 * Cached by driver id, so a scheduled rebuild costs zero Wikimedia requests
 * unless the grid changes. Returns a map of driverId -> credit record.
 */
export async function ensurePortraits(drivers, { assetsDir, dataDir }) {
  const outDir = path.join(assetsDir, 'drivers');
  await mkdir(outDir, { recursive: true });

  const creditsPath = path.join(dataDir, 'portraits.json');
  let credits = {};
  try {
    credits = JSON.parse(await readFile(creditsPath, 'utf8'));
  } catch {
    /* first run */
  }

  let fetched = 0;
  let skipped = 0;

  for (const driver of drivers) {
    const cached = credits[driver.id];
    if (cached && (cached.unavailable || (cached.file && (await exists(path.join(assetsDir, cached.file)))))) {
      continue;
    }

    try {
      const found = await resolve(driver.wikiTitle);
      await sleep(POLITE_DELAY);

      if (!found || found.skipped) {
        credits[driver.id] = {
          unavailable: true,
          reason: found?.skipped ? `licence not confirmed free (${found.licence})` : 'no image on page',
        };
        skipped++;
        continue;
      }

      const ext = (found.url.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] ?? 'jpg').toLowerCase();
      const rel = path.posix.join('drivers', `${driver.id}.${ext}`);
      await downloadWithinBudget(found, path.join(assetsDir, rel));

      credits[driver.id] = {
        file: rel,
        author: found.author,
        licence: found.licence,
        licenceUrl: found.licenceUrl,
        source: found.descriptionUrl,
      };
      fetched++;
    } catch (err) {
      console.warn(`  ! portrait for ${driver.id}: ${err.message}`);
      credits[driver.id] = { unavailable: true, reason: err.message };
      skipped++;
    }
  }

  await writeFile(creditsPath, JSON.stringify(credits, null, 2));

  if (fetched || skipped) {
    console.log(`  portraits: ${fetched} fetched, ${skipped} unavailable`);
  }
  return credits;
}
