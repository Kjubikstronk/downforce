/* Constructor marks.
 *
 * Not team logos, and deliberately not evocative of them. Real liveries are
 * trademarks; the copies on Wikipedia are non-free uploads under Wikipedia's
 * own fair-use exemption, which doesn't transfer. Designing something to
 * resemble a mark you don't own is worse than ignoring it entirely — trademark
 * turns on likelihood of confusion, and deliberate resemblance is what creates
 * it.
 *
 * So these marks earn their connection to a team the honest way: each one is a
 * readout of that team's actual season, in the same geometric language for
 * everybody.
 *
 *   blades      the team's race wins — more wins, denser mark
 *   lean        championship position — P1 stands upright, the tail leans away
 *   ring        points as a share of the leader's — the leader closes the circle
 *
 * The leader is upright, dense and closed. A pointless backmarker is a single
 * hollow blade, leaning hard, with no ring at all. The marks redraw themselves
 * every time the standings move, which is the same idea the rest of the page
 * runs on: the shape of the thing is the data, not a picture of it.
 */

const BOX = 64;
const CENTRE = BOX / 2;

const RING_RADIUS = 25;
const BLADE_SPAN = 26;
const BLADE_TOP = 19;
const BLADE_HEIGHT = BOX - BLADE_TOP * 2;
const BLADE_GAP = 2;

const MAX_LEAN = 28;

const rad = (deg) => (deg * Math.PI) / 180;

/* An arc opening from twelve o'clock, clockwise. */
function arcPath(sweepDeg) {
  const start = -90;
  const end = start + sweepDeg;
  const x1 = CENTRE + RING_RADIUS * Math.cos(rad(start));
  const y1 = CENTRE + RING_RADIUS * Math.sin(rad(start));
  const x2 = CENTRE + RING_RADIUS * Math.cos(rad(end));
  const y2 = CENTRE + RING_RADIUS * Math.sin(rad(end));
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * An inline SVG mark for one constructor.
 *
 * @param {{id:string, position:number, points:number, wins:number}} team
 * @param {{leaderPoints:number, fieldSize:number}} context
 */
export function renderMark(team, context) {
  const parts = [];

  /* Ring — points as a share of the leader's. */
  const leader = Math.max(context.leaderPoints ?? 0, 0);
  const share = leader > 0 ? Math.min(Math.max(team.points / leader, 0), 1) : 0;

  // The full track the ring runs on, so an empty ring still reads as "empty"
  // rather than as a missing element.
  parts.push(
    `<circle cx="${CENTRE}" cy="${CENTRE}" r="${RING_RADIUS}" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.16"/>`
  );

  if (share >= 0.999) {
    parts.push(
      `<circle cx="${CENTRE}" cy="${CENTRE}" r="${RING_RADIUS}" fill="none" stroke="currentColor" stroke-width="2.5"/>`
    );
  } else if (team.points > 0) {
    // A team on one point out of hundreds still scores a visible tick. Scoring
    // at all is categorically different from not scoring, and the mark has to
    // show that difference rather than round it away.
    parts.push(
      `<path d="${arcPath(Math.max(share * 360, 7))}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="butt"/>`
    );
  }

  /* Blades — one per win. A winless team still gets one, hollow, so the mark
     never collapses to an empty ring. */
  const wins = Math.max(team.wins ?? 0, 0);
  const count = Math.max(wins, 1);
  const width = Math.max((BLADE_SPAN - (count - 1) * BLADE_GAP) / count, 1.4);
  const span = count * width + (count - 1) * BLADE_GAP;
  const startX = CENTRE - span / 2;

  const blades = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * (width + BLADE_GAP);
    blades.push(
      wins > 0
        ? `<rect x="${x.toFixed(2)}" y="${BLADE_TOP}" width="${width.toFixed(2)}" height="${BLADE_HEIGHT}" fill="currentColor"/>`
        : `<rect x="${x.toFixed(2)}" y="${BLADE_TOP}" width="${width.toFixed(2)}" height="${BLADE_HEIGHT}" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.7"/>`
    );
  }

  /* Lean — championship position. skewX pivots on the origin, so the centre
     has to be moved there and back. */
  const field = Math.max((context.fieldSize ?? 1) - 1, 1);
  const lean = (Math.min(team.position - 1, field) / field) * MAX_LEAN;
  const transform = lean
    ? ` transform="translate(${CENTRE} ${CENTRE}) skewX(${lean.toFixed(1)}) translate(-${CENTRE} -${CENTRE})"`
    : '';

  parts.push(`<g${transform}>${blades.join('')}</g>`);

  return (
    `<svg class="mark" viewBox="0 0 ${BOX} ${BOX}" aria-hidden="true" focusable="false">` +
    parts.join('') +
    `</svg>`
  );
}

/** Plain-language description of what a given mark is showing. */
export function describeMark(team, context) {
  const leader = Math.max(context.leaderPoints ?? 0, 0);
  const exact = leader > 0 ? (team.points / leader) * 100 : 0;
  const share = team.points > 0 && exact < 1 ? '<1' : String(Math.round(exact));
  const wins = team.wins ?? 0;
  return `${wins === 0 ? 'No wins' : `${wins} win${wins === 1 ? '' : 's'}`}, ${share}% of the leader's points, P${team.position}`;
}
