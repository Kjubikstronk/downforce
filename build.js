/* f1page build — fetch the current F1 season from Jolpica-F1, then render a
   static page. Keeps the last good data if the API is unreachable, so a failed
   scheduled run degrades to "slightly stale" rather than "broken". */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePortraits } from './lib/portraits.js';
import { renderMark } from './lib/marks.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const ASSETS = path.join(ROOT, 'assets');
const SRC = path.join(ROOT, 'src');

const SITE_URL = process.env.SITE_URL || 'https://kjubikstronk.github.io/f1page/';
const API = 'https://api.jolpi.ca/ergast/f1/current';

/* Team colours. Approximations chosen so each section reads as a distinct
   change of state on a near-black background — several real liveries are close
   enough to each other that using exact values would make consecutive sections
   look identical. Tweak freely; nothing else depends on these. */
const TEAM_COLORS = {
  mercedes: '#00d7b6',
  ferrari: '#e8002d',
  mclaren: '#ff8000',
  red_bull: '#3671c6',
  rb: '#6692ff',
  alpine: '#ff87bc',
  haas: '#b6babd',
  audi: '#9ad11f',
  williams: '#64c4ff',
  aston_martin: '#229971',
  cadillac: '#c6a664',
  sauber: '#52e252',
  alphatauri: '#6692ff',
  alfa: '#c92d4b',
};
const FALLBACK_COLOR = '#8a94a6';

/* ---------- helpers ------------------------------------------------------- */

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const pad2 = (n) => String(n).padStart(2, '0');

async function fetchJSON(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'user-agent': 'f1page/1.0 (static site build)' },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

/* Fetch fresh; on failure fall back to whatever we stored last time. */
async function fetchOrCached(url, cacheName) {
  const cachePath = path.join(DATA, cacheName);
  try {
    const fresh = await fetchJSON(url);
    await writeFile(cachePath, JSON.stringify(fresh, null, 2));
    return { data: fresh, stale: false };
  } catch (err) {
    console.warn(`  ! ${cacheName}: ${err.message} — trying cached copy`);
    try {
      return { data: JSON.parse(await readFile(cachePath, 'utf8')), stale: true };
    } catch {
      throw new Error(`${cacheName}: fetch failed and no cached copy exists`);
    }
  }
}

/* ---------- shape the data ------------------------------------------------ */

function buildModel(consRaw, drvRaw, raceRaw) {
  const consList = consRaw.MRData.StandingsTable.StandingsLists[0];
  const drvList = drvRaw.MRData.StandingsTable.StandingsLists[0];
  const races = raceRaw.MRData.RaceTable.Races ?? [];

  const season = consList?.season ?? raceRaw.MRData.RaceTable.season;
  const round = consList?.round ?? '0';

  // Group drivers under their current constructor, best-placed first.
  const byTeam = new Map();
  for (const d of drvList?.DriverStandings ?? []) {
    const team = d.Constructors[d.Constructors.length - 1];
    if (!byTeam.has(team.constructorId)) byTeam.set(team.constructorId, []);
    byTeam.get(team.constructorId).push({
      id: d.Driver.driverId,
      code: d.Driver.code || d.Driver.familyName.slice(0, 3).toUpperCase(),
      name: `${d.Driver.givenName} ${d.Driver.familyName}`,
      first: d.Driver.givenName,
      last: d.Driver.familyName,
      number: d.Driver.permanentNumber ?? null,
      wikiTitle: decodeURIComponent((d.Driver.url ?? '').split('/wiki/')[1] ?? ''),
      points: Number(d.points),
      position: Number(d.position),
    });
  }

  const teams = (consList?.ConstructorStandings ?? []).map((c) => ({
    id: c.Constructor.constructorId,
    name: c.Constructor.name,
    nationality: c.Constructor.nationality,
    position: Number(c.position),
    points: Number(c.points),
    wins: Number(c.wins),
    color: TEAM_COLORS[c.Constructor.constructorId] ?? FALLBACK_COLOR,
    drivers: (byTeam.get(c.Constructor.constructorId) ?? []).sort(
      (a, b) => a.position - b.position
    ),
  }));

  const calendar = races.map((r) => ({
    round: Number(r.round),
    name: r.raceName,
    circuit: r.Circuit.circuitName,
    locality: r.Circuit.Location.locality,
    country: r.Circuit.Location.country,
    iso: r.time ? `${r.date}T${r.time}` : `${r.date}T12:00:00Z`,
  }));

  const now = Date.now();
  const next = calendar.find((r) => new Date(r.iso).getTime() > now) ?? null;

  return { season, round, teams, calendar, next };
}

/* ---------- render -------------------------------------------------------- */

/* The corridor between two teams is as tall as the points gap between them,
   scaled against the largest gap in the field. This is the whole idea of the
   page, so it lives in one small function: gap in points -> gap in viewports. */
const MIN_GAP_VH = 8;
const MAX_GAP_VH = 68;

function corridorHeight(gap, maxGap) {
  return (MIN_GAP_VH + (gap / Math.max(maxGap, 1)) * (MAX_GAP_VH - MIN_GAP_VH)).toFixed(1);
}

/* A portrait, or the driver's initials when we have no freely-licensed one.
   Portraits are tinted to the team colour in CSS rather than baked in, so the
   file we ship stays the file we were licensed. */
function renderShot(driver, portraits) {
  const credit = portraits[driver.id];
  const number = driver.number
    ? `<span class="driver-no" aria-hidden="true">${esc(driver.number)}</span>`
    : '';

  if (!credit || credit.unavailable || !credit.file) {
    const initials = `${driver.first?.[0] ?? ''}${driver.last?.[0] ?? ''}`.toUpperCase();
    return `<figure class="driver-shot is-empty"><span class="driver-initials" aria-hidden="true">${esc(initials)}</span>${number}</figure>`;
  }

  return `<figure class="driver-shot"><img src="assets/${esc(credit.file)}" alt="" loading="lazy" decoding="async">${number}</figure>`;
}

function renderTeam(team, portraits) {
  const drivers = team.drivers.length
    ? team.drivers
        .map(
          (d) => `        <li class="driver">
          ${renderShot(d, portraits)}
          <div class="driver-id">
            <span class="driver-code">${esc(d.code)}</span>
            <span class="driver-name">${esc(d.first)} <b>${esc(d.last)}</b></span>
            <span class="driver-pts">${d.points} pts</span>
          </div>
        </li>`
        )
        .join('\n')
    : '        <li class="driver"><div class="driver-id"><span class="driver-name">Driver line-up not published yet</span></div></li>';

  const winLabel =
    team.wins === 0 ? 'No wins yet' : `${team.wins} win${team.wins === 1 ? '' : 's'}`;

  return `  <section class="team" id="p${team.position}" data-color="${team.color}" data-pos="${team.position}" aria-labelledby="t${team.position}">
    <p class="team-pos" aria-hidden="true">${pad2(team.position)}</p>
    <div class="team-body">
      <h2 class="team-name" id="t${team.position}">${renderMark(team.id)}${esc(team.name)}</h2>
      <p class="team-meta">P${team.position} &middot; ${esc(team.nationality)} &middot; ${winLabel}</p>
      <p class="team-points"><b>${team.points}</b><i>points</i></p>
      <ul class="drivers">
${drivers}
      </ul>
    </div>
  </section>`;
}

function renderSections(teams, portraits) {
  const gaps = teams.slice(1).map((t, i) => teams[i].points - t.points);
  const maxGap = Math.max(...gaps, 1);
  const out = [];

  teams.forEach((team, i) => {
    out.push(renderTeam(team, portraits));

    const nextTeam = teams[i + 1];
    if (!nextTeam) return;

    const gap = team.points - nextTeam.points;
    const label =
      gap === 0
        ? 'Level on points'
        : `<b>${gap}</b> point${gap === 1 ? '' : 's'} back`;

    out.push(`  <div class="gap" style="--gap-h:${corridorHeight(gap, maxGap)}svh" data-from="${team.color}" data-to="${nextTeam.color}" aria-hidden="true">
    <p class="gap-label">${label}</p>
  </div>`);
  });

  return out.join('\n');
}

function renderRail(teams) {
  return teams
    .map(
      (t) =>
        `  <a class="rail-tick" data-pos="${t.position}" href="#p${t.position}" title="P${t.position} ${esc(t.name)}">${pad2(t.position)}</a>`
    )
    .join('\n');
}

function renderHeroNext(next) {
  if (!next) {
    return `    <div class="next-race"><p class="next-race-name">Season complete</p></div>`;
  }
  return `    <div class="next-race">
      <p class="eyebrow">Next race &middot; round ${next.round}</p>
      <p class="next-race-name">${esc(next.name)}</p>
      <p class="next-race-when" data-iso="${next.iso}">${next.iso.slice(0, 10)}</p>
      <p class="next-race-where">${esc(next.circuit)}, ${esc(next.locality)}</p>
    </div>`;
}

function renderRaces(calendar, next) {
  const now = Date.now();
  return calendar
    .map((r) => {
      const done = new Date(r.iso).getTime() < now;
      const isNext = next && r.round === next.round;
      const cls = [done ? 'is-done' : '', isNext ? 'is-next' : ''].filter(Boolean).join(' ');
      return `    <li${cls ? ` class="${cls}"` : ''}>
      <span class="race-round">R${pad2(r.round)}</span>
      <span class="race-name">${esc(r.name)} <span class="race-round">&mdash; ${esc(r.locality)}, ${esc(r.country)}</span></span>
      <span class="race-when" data-iso="${r.iso}">${r.iso.slice(0, 10)}</span>
    </li>`;
    })
    .join('\n');
}

/* Every licence we accept except CC0 requires naming the author, so the credits
   are part of the page rather than a file nobody reads. */
function renderCredits(teams, portraits) {
  const used = [];
  for (const team of teams) {
    for (const d of team.drivers) {
      const c = portraits[d.id];
      if (c && !c.unavailable && c.file) {
        used.push(
          `${esc(d.name)} &mdash; ${esc(c.author)}, ${
            c.licenceUrl
              ? `<a href="${esc(c.licenceUrl)}" rel="noopener nofollow">${esc(c.licence)}</a>`
              : esc(c.licence)
          }${c.source ? `, <a href="${esc(c.source)}" rel="noopener nofollow">source</a>` : ''}`
        );
      }
    }
  }

  if (!used.length) return '';
  return `    <details class="credits">
      <summary>Driver portrait credits (${used.length})</summary>
      <ul>
${used.map((u) => `        <li>${u}</li>`).join('\n')}
      </ul>
    </details>`;
}

/* ---------- main ---------------------------------------------------------- */

async function main() {
  await mkdir(DATA, { recursive: true });
  await mkdir(ASSETS, { recursive: true });

  console.log('Fetching season data...');
  const [cons, drv, races] = await Promise.all([
    fetchOrCached(`${API}/constructorstandings/?format=json`, 'constructor-standings.json'),
    fetchOrCached(`${API}/driverstandings/?format=json`, 'driver-standings.json'),
    fetchOrCached(`${API}/races/?format=json&limit=100`, 'races.json'),
  ]);

  const stale = cons.stale || drv.stale || races.stale;
  const model = buildModel(cons.data, drv.data, races.data);

  if (!model.teams.length) {
    throw new Error('No constructor standings returned — refusing to publish an empty page');
  }

  console.log(`  ${model.season}, after round ${model.round}: ${model.teams.length} teams`);
  if (stale) console.log('  (built from cached data — at least one fetch failed)');

  await writeFile(path.join(DATA, 'model.json'), JSON.stringify(model, null, 2));

  // Cached by driver id — a scheduled rebuild costs no Wikimedia requests
  // unless the grid has changed.
  const allDrivers = model.teams.flatMap((t) => t.drivers).filter((d) => d.wikiTitle);
  const portraits = await ensurePortraits(allDrivers, { assetsDir: ASSETS, dataDir: DATA });

  const now = new Date();
  const leader = model.teams[0];
  const title = `The Order — ${model.season} F1 constructor standings`;
  const desc = `${model.season} Formula 1 constructor standings after round ${model.round}. ${leader.name} lead on ${leader.points} points. Scroll the championship top to bottom, with every points gap to scale.`;

  const html = (await readFile(path.join(SRC, 'template.html'), 'utf8'))
    .replaceAll('{{TITLE}}', esc(title))
    .replaceAll('{{DESC}}', esc(desc))
    .replaceAll('{{URL}}', SITE_URL)
    .replaceAll('{{SEASON}}', esc(model.season))
    .replaceAll('{{ROUND}}', esc(model.round))
    .replaceAll('{{TEAM_COUNT}}', String(model.teams.length))
    .replaceAll('{{RAIL}}', renderRail(model.teams))
    .replaceAll('{{HERO_NEXT}}', renderHeroNext(model.next))
    .replaceAll('{{SECTIONS}}', renderSections(model.teams, portraits))
    .replaceAll('{{CREDITS}}', renderCredits(model.teams, portraits))
    .replaceAll('{{RACES}}', renderRaces(model.calendar, model.next))
    .replaceAll('{{UPDATED_ISO}}', now.toISOString())
    .replaceAll(
      '{{UPDATED}}',
      now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) +
        ' UTC'
    );

  await writeFile(path.join(ROOT, 'index.html'), html);
  await copyFile(path.join(SRC, 'styles.css'), path.join(ASSETS, 'styles.css'));
  await copyFile(path.join(SRC, 'app.js'), path.join(ASSETS, 'app.js'));

  await writeFile(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`
  );
  await writeFile(
    path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}</loc><lastmod>${now.toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`
  );
  await writeFile(path.join(ROOT, '.nojekyll'), '');

  console.log('Built index.html');
}

main().catch((err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
