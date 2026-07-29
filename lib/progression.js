/* Championship order, round by round.
 *
 * The page shows where the field stands. This is how it got there — one
 * constructor-standings snapshot per completed round, which is the only way to
 * see that Red Bull sat sixth in March, or that a team climbing is a team
 * climbing rather than a team that started high.
 *
 * Cached per round, and a completed round never changes, so a scheduled rebuild
 * fetches exactly the one new snapshot. Jolpica allows 4 requests/second and
 * 500/hour, and asks for a descriptive user-agent.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UA = {
  'user-agent': 'downforce/1.0 (https://github.com/Kjubikstronk/downforce; F1 fan project)',
};

const API = 'https://api.jolpi.ca/ergast/f1';
const DELAY = 350;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRound(season, round) {
  const res = await fetch(`${API}/${season}/${round}/constructorstandings/?format=json`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  const list = json?.MRData?.StandingsTable?.StandingsLists?.[0];
  if (!list) return null;

  const snapshot = {};
  for (const entry of list.ConstructorStandings ?? []) {
    snapshot[entry.Constructor.constructorId] = {
      pos: Number(entry.position),
      pts: Number(entry.points),
    };
  }
  return snapshot;
}

/**
 * Standings after every completed round, keyed by round number.
 *
 * @param {string|number} season
 * @param {number} latestRound
 * @param {{dataDir: string}} options
 */
export async function ensureProgression(season, latestRound, { dataDir }) {
  const file = path.join(dataDir, 'progression.json');

  let cache = {};
  try {
    const stored = JSON.parse(await readFile(file, 'utf8'));
    // Discard the cache wholesale if it belongs to a previous season.
    if (String(stored.season) === String(season)) cache = stored.rounds ?? {};
  } catch {
    /* first run */
  }

  let fetched = 0;
  for (let round = 1; round <= latestRound; round++) {
    if (cache[round]) continue;
    try {
      const snapshot = await fetchRound(season, round);
      if (snapshot) {
        cache[round] = snapshot;
        fetched++;
      }
      await sleep(DELAY);
    } catch (err) {
      // A missing mid-season round leaves a gap the chart can bridge; it is not
      // worth failing the whole build over.
      console.warn(`  ! progression round ${round}: ${err.message}`);
    }
  }

  await writeFile(file, JSON.stringify({ season: String(season), rounds: cache }, null, 2));
  if (fetched) console.log(`  progression: ${fetched} round(s) fetched`);

  return cache;
}

/**
 * Position per round for one constructor, oldest first.
 * Rounds the team has no entry for come back as null so the line can break.
 */
export function seriesFor(progression, constructorId, latestRound) {
  const out = [];
  for (let round = 1; round <= latestRound; round++) {
    const snapshot = progression[round];
    out.push(snapshot?.[constructorId]?.pos ?? null);
  }
  return out;
}
