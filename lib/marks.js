/* Constructor marks.
 *
 * Real team logos are trademarks, and the copies on Wikipedia are non-free
 * uploads covered by Wikipedia's own fair-use exemption, which doesn't travel.
 * So these are original: one geometric system, eleven configurations of it.
 *
 * The system is a 64x64 field holding a set of slanted blades — the language of
 * aero furniture, wings and brake ducts, rather than anything anyone owns. Each
 * team varies four parameters, so the set reads as a family while staying
 * individually recognisable. Nothing here imitates the shape, silhouette or
 * device of an actual team logo.
 *
 * Deliberately not a heraldic badge per team: badges invite comparison with the
 * real ones, and would lose.
 */

const BOX = 64;

/* blades: how many bars      slant: degrees off vertical
   lit:    which bar is solid  motif: what sits behind them */
const MARKS = {
  mercedes: { blades: 3, slant: 0, lit: 1, motif: 'ring' },
  ferrari: { blades: 4, slant: 18, lit: 0, motif: 'none' },
  mclaren: { blades: 3, slant: 22, lit: 2, motif: 'bar' },
  red_bull: { blades: 4, slant: -18, lit: 3, motif: 'ring' },
  rb: { blades: 3, slant: -18, lit: 0, motif: 'none' },
  alpine: { blades: 2, slant: 26, lit: 1, motif: 'bar' },
  haas: { blades: 4, slant: 0, lit: 3, motif: 'none' },
  audi: { blades: 3, slant: 12, lit: 1, motif: 'bar' },
  williams: { blades: 5, slant: 14, lit: 4, motif: 'none' },
  aston_martin: { blades: 2, slant: -26, lit: 0, motif: 'ring' },
  cadillac: { blades: 4, slant: 26, lit: 1, motif: 'bar' },
};

/* Any constructor we haven't styled still gets a stable mark rather than a
   blank: the id seeds the same four parameters. */
function derive(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const slants = [0, 12, 18, 22, 26, -12, -18, -26];
  const motifs = ['none', 'bar', 'ring'];
  const blades = 2 + (h % 4);
  return {
    blades,
    slant: slants[(h >> 3) % slants.length],
    lit: (h >> 7) % blades,
    motif: motifs[(h >> 11) % motifs.length],
  };
}

/**
 * An inline SVG mark for one constructor.
 * `currentColor` throughout, so it inherits whatever the section is tinted.
 */
export function renderMark(constructorId) {
  const m = MARKS[constructorId] ?? derive(constructorId);

  const gap = 4;
  const width = m.blades > 4 ? 6 : 8;
  const span = m.blades * width + (m.blades - 1) * gap;
  const startX = (BOX - span) / 2;
  const top = 14;
  const height = BOX - top * 2;

  // The motif stays upright; only the blades lean.
  let motif = '';
  if (m.motif === 'ring') {
    motif = `<circle cx="32" cy="32" r="21" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.45"/>`;
  } else if (m.motif === 'bar') {
    motif = `<rect x="8" y="30.5" width="48" height="3" fill="currentColor" opacity="0.3"/>`;
  }

  const parts = [];

  for (let i = 0; i < m.blades; i++) {
    const x = startX + i * (width + gap);
    const solid = i === m.lit;
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${top}" width="${width}" height="${height}" ` +
        (solid
          ? `fill="currentColor"/>`
          : `fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.75"/>`)
    );
  }

  // skewX pivots on the origin, so move the centre there and back.
  const skew = m.slant
    ? ` transform="translate(32 32) skewX(${m.slant}) translate(-32 -32)"`
    : '';

  return (
    `<svg class="mark" viewBox="0 0 ${BOX} ${BOX}" aria-hidden="true" focusable="false">` +
    motif +
    `<g${skew}>${parts.join('')}</g>` +
    `</svg>`
  );
}
