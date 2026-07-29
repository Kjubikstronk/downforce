# Downforce — scroll-driven F1 standings fanpage

## Purpose

A single-page F1 fan site built around one idea: scrolling down the page walks
you down the current championship order. Land on the page and you're looking
at P1; scroll, and each constructor reveals in rank order until you hit P10.
The page's color theme morphs to match whichever team is currently in view.
Differentiator vs. typical F1 fan sites (which are static tables/grids): the
scroll-driven reveal and per-team color morph are the whole point, not a
decoration bolted onto a table.

## Non-goals

- Not a betting/prediction site, not a news aggregator, not a forum.
- No user accounts, comments, or any backend beyond a static build.
- No official team logos or trademarked assets — color swatches/badges only,
  to avoid licensing issues.
- No live-during-race telemetry or lap-by-lap data — standings/calendar only.

## Architecture

Plain HTML/CSS/JS, no framework, matching the existing `press-it` (Taemin
fanpage) project's proven pattern:

- `build.js` (Node) fetches data and writes static JSON + injects it into the
  output HTML at build time — no client-side fetch, no loading flicker.
- `serve.js` for local preview.
- GitHub Actions workflow rebuilds on a schedule (start at every 6h, same
  cadence as press-it; can be tightened around race weekends later) and
  commits the refreshed output.
- GitHub Pages for hosting, deployed from this new repo (`downforce`). Custom
  domain can be added later the same way `taemin.online` was added to
  press-it — not needed for the initial launch.

## Data source

**Jolpica-F1** (the actively maintained, free, no-API-key successor to the
Ergast API) provides:

- Current-season constructor standings (position, points, team).
- Current-season driver standings (position, points, driver, team).
- Race calendar (past results, next race date/time).

`build.js` fetches these three, normalizes them into `data/constructors.json`,
`data/drivers.json`, and `data/calendar.json`, and keeps the last-good copy if
a scheduled fetch fails — the build must still stamp metadata/timestamps on a
failed fetch rather than skip that step (this is the bug the Taemin project
hit: an early "nothing changed" return skipped SEO stamping entirely).

Team colors are a small hardcoded hex map (10 constructors), not fetched from
any API.

## Page structure

1. **Hero** — page title, current season, next-race teaser (name, circuit,
   countdown).
2. **Main scroll journey** — 10 full-viewport sections, one per constructor,
   ordered P1 (top) → P10 (bottom):
   - Team name, position badge, points.
   - The team's two drivers and their individual points.
   - As a section enters the viewport (via GSAP ScrollTrigger), the page's
     background/accent CSS custom properties crossfade to that team's color,
     and the team/driver content animates in (fade/slide).
   - Visual language: dark carbon-fiber/HUD base (black background, thin
     data-line dividers, monospace "telemetry"-style numerals for points).
     Team color appears as an accent glow/gradient wash over the dark base —
     never a full-saturation background — so text contrast stays readable at
     any team's color.
3. **Footer** — compact, normally-scrolling (not scroll-jacked) calendar of
   upcoming races and most recent race result.

### Accessibility / reduced motion

`prefers-reduced-motion: reduce` disables the scroll-jacking/pin behavior and
parallax; sections still appear in order via simple opacity fades instead of
animated color morphing. Color contrast for text over any team's accent wash
must meet WCAG AA at both light and heavy ends of each team's color range.

### Mobile

Scroll-linked pinning is simplified/removed on narrow viewports if it fights
with mobile scroll physics — sections still crossfade background color on
scroll position, just without pinning the section in place.

## Error handling

- Failed API fetch during scheduled build: keep last-good `data/*.json`,
  still stamp build metadata, do not fail the whole build.
- Off-season / no standings yet: render a "preseason" state instead of an
  empty section.

## Testing

- Local preview via `serve.js` in the Browser pane.
- Manual check: scroll animation end-to-end on desktop and mobile viewport
  sizes, `prefers-reduced-motion` behavior, color contrast on at least the
  lightest (e.g. yellow/white-liveried) and darkest team colors.
- Build script: verify it produces valid output when the API call fails
  (simulate by pointing at a bad URL) — confirms the last-good-data fallback
  actually works rather than crashing the build.

## Amendments during build

Kept as a record of where the original design was wrong or incomplete.

- **Eleven teams, not ten.** 2026 has Cadillac as an eleventh entry and Audi in
  place of Sauber. The build derives the field size from the data.
- **The corridor mapping had a floor**, which made the hero's central claim
  false — a 1-point gap and a 40-point gap looked far more alike than they are.
  It is now strictly proportional, with labels moved onto the seam so a
  corridor can have no height at all.
- **Driver portraits added** from Wikimedia Commons, with per-file licence
  checks and rendered credits. Not in the original scope, which assumed no
  imagery was safely available.
- **Constructor marks added.** The original spec ruled out team logos on
  trademark grounds and stopped there. The marks are generated from each team's
  own season instead, so they carry meaning rather than decoration.
- **Season traces and a points altimeter added** once per-round standings were
  confirmed available from the same API.
- **Data licence is CC BY-NC-SA 4.0.** Non-commercial. This was not established
  when the spec was written and constrains any future monetisation.

## Repo / hosting

- New repo `f1page` at `Desktop\f1page`, separate from the Taemin fanpage
  repo (`press-it`).
- GitHub Pages enabled from the start; custom domain deferred until the site
  is liked as-is.
