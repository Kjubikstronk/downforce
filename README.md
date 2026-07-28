# f1page — The Order

The Formula 1 constructors' championship, read as a descent. P1 sits at the top
of the page; scrolling down walks you to last place.

The idea the page is built on: **the distance you scroll between any two teams
is the points gap between them, to scale.** A 111-point deficit is a long, empty
fall through the dark. A one-point deficit is over before you notice it. You
don't read the gaps, you feel them in the scroll.

The accent colour bleeds from one team's to the next across each of those
corridors, so the whole page is whichever team you're currently standing on.

## Running it

```bash
npm run dev
```

That builds `index.html` from live data and serves it at
<http://localhost:4175>.

To build without serving:

```bash
npm run build
```

## How it works

- `build.js` pulls constructor standings, driver standings and the race
  calendar from the [Jolpica-F1 API](https://api.jolpi.ca/ergast/) (free, no
  key), writes normalised JSON into `data/`, and renders `index.html` from
  `src/template.html`.
- If a fetch fails, the build falls back to the last good copy in `data/`
  rather than publishing an empty page. It only hard-fails when there is no
  cached copy at all.
- `src/styles.css` and `src/app.js` are copied to `assets/` at build time. Edit
  the copies in `src/`; the ones in `assets/` are generated.
- A GitHub Action rebuilds every 6 hours and deploys to GitHub Pages.

## Notes

- The page is fully readable with JavaScript disabled — it degrades to an
  ordered list of teams, drivers and races. The script adds the scroll-linked
  colour and the entrance reveals, nothing more.
- Accent colours are lightened (`--accent-ink`) wherever they're used for small
  text. Several real liveries — Ferrari red, Red Bull blue — fall below 4.5:1
  on this background at their true value.
- `prefers-reduced-motion` drops the scroll-linked motion and the reveals.

Unofficial fan project. Not associated with Formula 1, the FIA, or any team.
