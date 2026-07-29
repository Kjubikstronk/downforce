# Downforce

The Formula 1 constructors' championship, read as a descent. P1 sits at the top
of the page; scrolling down walks you to last place.

Named for the aerodynamic force that presses a car into the track, which is
also what the page does to the reader.

The idea the page is built on: **the distance you scroll between any two teams
is the points gap between them, to scale.** A 111-point deficit is a long, empty
fall through the dark. A one-point deficit is about two pixels. Teams level on
points sit flush against each other. You don't read the gaps, you feel them in
the scroll.

That claim is load-bearing, so the mapping is strictly proportional — a point
buys the same slice of page everywhere on the page. Any floor or minimum height
would make it false, which is worth remembering before adding one back to make
the small corridors look tidier.

## Running it

```bash
npm run dev
```

Builds `index.html` from live data and serves it at <http://localhost:4175>.

To build without serving:

```bash
npm run build
```

## What's on the page

- **The descent.** Eleven full-viewport team sections in championship order,
  separated by corridors whose height is the points gap. The accent colour
  scrubs from one team's to the next as you fall through a corridor.
- **A points altimeter** in the fixed rail, reading the points you are standing
  on. It interpolates through the corridors and steps on whole points.
- **Constructor marks** — original geometry generated from each team's season:
  one blade per win, lean angle from championship position, ring sweep from
  points as a share of the leader's. They redraw as the standings move.
- **Season traces** — each team's rank per round, emphasised against the rest
  of the field drawn as context.
- **Driver portraits**, duotone-tinted to the live team colour.

## How it works

- `build.js` pulls standings, per-round history and the calendar from the
  [Jolpica-F1 API](https://api.jolpi.ca/ergast/) (free, no key), writes
  normalised JSON into `data/`, and renders `index.html` from
  `src/template.html`.
- If a fetch fails, the build falls back to the last good copy in `data/`
  rather than publishing an empty page. It only hard-fails when there is no
  cached copy at all.
- `src/styles.css` and `src/app.js` are copied to `assets/` at build time. Edit
  the copies in `src/`; the ones in `assets/` are generated.
- `lib/` holds the pieces with their own caches: `portraits.js`,
  `progression.js`, `marks.js`, `sparkline.js`.
- A GitHub Action rebuilds every 6 hours and deploys to GitHub Pages.

Caches are keyed so a scheduled rebuild is cheap: a completed round never
changes, and a driver's portrait is fetched once.

## Licensing — read before monetising

**Jolpica-F1 data is CC BY-NC-SA 4.0. It is non-commercial.** If this site ever
carries ads, sponsorship or affiliate links, that needs a conversation with
Jolpica first (admin@jolpi.ca). The same applies to OpenF1 if it's ever added.

Driver portraits come from Wikimedia Commons. Wikipedia requires freely-licensed
images for photos of living people, so these are CC BY-SA / CC BY / CC0 / OGL.
Every file records its author and licence, an allowlist rejects anything not
positively identified as free, and the credits render in the page footer. Files
ship unmodified — the team colour is applied in CSS, not baked in.

**There are deliberately no team logos.** They are trademarks, and the copies on
Wikipedia are non-free uploads under Wikipedia's own fair-use exemption, which
does not transfer to third parties. Designing marks to *resemble* real logos
would be worse than having none: infringement turns on likelihood of confusion,
and deliberate resemblance is what creates it. The generated marks in
`lib/marks.js` are original by construction.

## Notes

- The page is fully readable with JavaScript disabled — it degrades to an
  ordered list of teams, drivers and races. The script adds the scroll-linked
  colour, the altimeter and the entrance reveals, nothing more.
- The accent colour is derived from scroll position rather than from scroll
  callbacks, so it is correct on load, after a resize, and on a restored scroll
  position.
- Accent colours are lightened (`--accent-ink`) wherever they're used for small
  text. Several real liveries — Ferrari red, Red Bull blue — fall below 4.5:1
  on this background at their true value.
- `prefers-reduced-motion` drops the scroll-linked motion and the reveals, and
  switches corridor colours once at the midpoint rather than scrubbing them.
- One portrait (`gasly.png`) is a PNG and stays over the size budget; lossless
  encoding of a photograph doesn't shrink usefully at any width. It's fetched
  once, flagged `minimised`, and left alone.

Unofficial fan project. Not associated with Formula 1, the FIA, or any team.
