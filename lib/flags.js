/* Country flags for the calendar.
 *
 * Deliberately not emoji. Windows ships no flag glyphs, so an emoji flag
 * renders there as the bare two-letter code — the one platform where it looks
 * broken rather than absent. These are SVGs from lipis/flag-icons (MIT),
 * fetched once at build time and served from assets/.
 *
 * The API gives country names, not codes, and its names are its own: "UK",
 * "USA", "UAE". Hence the explicit map rather than a lookup library. Countries
 * beyond the current calendar are included so a schedule change doesn't drop a
 * flag silently.
 */

import { writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const UA = { 'user-agent': 'downforce/1.0 (https://github.com/Kjubikstronk/downforce)' };
const SOURCE = 'https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CODES = {
  // On the 2026 calendar
  australia: 'au',
  china: 'cn',
  japan: 'jp',
  usa: 'us',
  canada: 'ca',
  monaco: 'mc',
  spain: 'es',
  austria: 'at',
  uk: 'gb',
  belgium: 'be',
  hungary: 'hu',
  netherlands: 'nl',
  italy: 'it',
  azerbaijan: 'az',
  singapore: 'sg',
  mexico: 'mx',
  brazil: 'br',
  qatar: 'qa',
  uae: 'ae',

  // Recently or previously on the calendar
  bahrain: 'bh',
  'saudi arabia': 'sa',
  france: 'fr',
  germany: 'de',
  portugal: 'pt',
  russia: 'ru',
  turkey: 'tr',
  vietnam: 'vn',
  korea: 'kr',
  india: 'in',
  malaysia: 'my',
  argentina: 'ar',
  'south africa': 'za',
  switzerland: 'ch',
  sweden: 'se',
  morocco: 'ma',
};

export function codeFor(country) {
  return CODES[String(country ?? '').trim().toLowerCase()] ?? null;
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download every flag the calendar needs. Cached by country code, so a
 * scheduled rebuild fetches nothing.
 *
 * @param {string[]} countries
 * @param {{assetsDir: string}} options
 * @returns {Promise<Record<string, string>>} country code -> path under assets/
 */
export async function ensureFlags(countries, { assetsDir }) {
  const outDir = path.join(assetsDir, 'flags');
  await mkdir(outDir, { recursive: true });

  const wanted = new Set();
  const unknown = new Set();
  for (const country of countries) {
    const code = codeFor(country);
    if (code) wanted.add(code);
    else if (country) unknown.add(country);
  }

  if (unknown.size) {
    console.warn(`  ! no flag mapped for: ${[...unknown].join(', ')}`);
  }

  const available = {};
  let fetched = 0;

  for (const code of wanted) {
    const rel = path.posix.join('flags', `${code}.svg`);
    const dest = path.join(assetsDir, rel);

    if (await exists(dest)) {
      available[code] = rel;
      continue;
    }

    try {
      const res = await fetch(`${SOURCE}/${code}.svg`, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(dest, await res.text(), 'utf8');
      available[code] = rel;
      fetched++;
      await sleep(120);
    } catch (err) {
      // A missing flag costs a small graphic, not the build.
      console.warn(`  ! flag ${code}: ${err.message}`);
    }
  }

  if (fetched) console.log(`  flags: ${fetched} fetched`);
  return available;
}

/** An <img> for a country, or an empty string when we have no flag for it. */
export function renderFlag(country, flags) {
  const code = codeFor(country);
  const file = code ? flags[code] : null;
  if (!file) return '';
  return `<img class="flag" src="assets/${file}" alt="" width="20" height="15" loading="lazy" decoding="async">`;
}
