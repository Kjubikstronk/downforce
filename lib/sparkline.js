/* Per-team championship trace.
 *
 * One small multiple per team: every constructor's rank across the season drawn
 * as recessive context, with this team's line emphasised in its own colour.
 *
 * Eleven series would need eleven categorical hues, which is past the point
 * where adjacent hues stay separable — especially under colour-vision
 * deficiency. Emphasis plus small multiples is the way out: each chart carries
 * one series that matters, so identity never rests on hue at all.
 *
 * Rank, not points. The page already encodes points as scroll distance; what it
 * cannot show is whether a team is climbing or sliding, which is the whole
 * question a standings page raises.
 */

const W = 300;
const H = 84;
const PAD_L = 6;
const PAD_R = 30; // room for the endpoint label
const PAD_Y = 12;

/** Map (roundIndex, position) to plot coordinates. Rank 1 sits at the top. */
function project(index, position, rounds, field) {
  const x = rounds > 1 ? PAD_L + (index / (rounds - 1)) * (W - PAD_L - PAD_R) : PAD_L;
  const y = field > 1 ? PAD_Y + ((position - 1) / (field - 1)) * (H - PAD_Y * 2) : H / 2;
  return [x, y];
}

/** A polyline that breaks across rounds the team has no entry for. */
function pathFor(series, rounds, field) {
  const segments = [];
  let current = [];

  series.forEach((position, index) => {
    if (position == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    const [x, y] = project(index, position, rounds, field);
    current.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  });
  if (current.length) segments.push(current);

  return segments
    .map((points) => (points.length === 1 ? `M ${points[0]} l 0.01 0` : `M ${points.join(' L ')}`))
    .join(' ');
}

/**
 * @param {string} teamId
 * @param {Record<string, number[]>} allSeries  every constructor's rank series
 * @param {number} field  number of constructors
 */
export function renderTrace(teamId, allSeries, field) {
  const own = allSeries[teamId] ?? [];
  const rounds = own.length;
  if (rounds < 2) return '';

  const known = own.filter((p) => p != null);
  if (!known.length) return '';

  const first = known[0];
  const last = known[known.length - 1];
  const best = Math.min(...known);
  const worst = Math.max(...known);

  // Context: everyone else, hairline and recessive.
  const context = Object.keys(allSeries)
    .filter((id) => id !== teamId)
    .map(
      (id) =>
        `<path d="${pathFor(allSeries[id], rounds, field)}" fill="none" stroke="var(--dimmer)" stroke-width="1" opacity="0.3" stroke-linejoin="round"/>`
    )
    .join('');

  const [endX, endY] = project(rounds - 1, last, rounds, field);

  // Rank is ordinal, so the only reference lines worth drawing are the extremes
  // of the field — a full grid would be eleven hairlines saying nothing.
  const [, topY] = project(0, 1, rounds, field);
  const [, botY] = project(0, field, rounds, field);

  /* Comparing only the endpoints reports a team that fell and recovered as
     having "held" its position, which is wrong in precisely the case worth
     looking at — Red Bull start and finish P4 having been P6 in between. So
     the range is part of the sentence whenever the team actually moved.
     Lower number is the better rank, so this says best/worst rather than
     high/low, which reads backwards for positions. */
  const move = first - last; // positive = climbed
  const steady = best === worst;
  const range = `best P${best}, worst P${worst}`;

  let summary;
  if (steady) {
    summary = `Held P${last} across all ${rounds} rounds`;
  } else if (move === 0) {
    summary = `P${last} now, as in round 1 — ${range}`;
  } else if (move > 0) {
    summary = `Up from P${first} to P${last} — ${range}`;
  } else {
    summary = `Down from P${first} to P${last} — ${range}`;
  }

  return `<figure class="trace">
          <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Championship position by round. ${summary}.">
            <line x1="${PAD_L}" y1="${topY}" x2="${W - PAD_R}" y2="${topY}" stroke="var(--line)" stroke-width="1"/>
            <line x1="${PAD_L}" y1="${botY}" x2="${W - PAD_R}" y2="${botY}" stroke="var(--line)" stroke-width="1"/>
            ${context}
            <path d="${pathFor(own, rounds, field)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            <circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--void)" stroke-width="2"/>
            <text x="${(endX + 9).toFixed(1)}" y="${(endY + 4).toFixed(1)}" class="trace-end">P${last}</text>
          </svg>
          <figcaption>${summary}</figcaption>
        </figure>`;
}
