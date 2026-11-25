# Bluesky in Today

**Status:** building. Owner said go on Nov 25.

## Running cost

$0/month. No new service, account, key, server or metered usage. One public Bluesky trends
request when Today opens, cached for 10 minutes. If Bluesky fails or rate-limits, the section
hides. Hosting stays on the existing GitHub Pages site.

## Defaults

- Section title **Trending on Bluesky**.
- Placed directly after the existing **Trending on X** section in Today, before
  “Pick up where you left off.” Not at the top.
- Five topics, each with the name and one-line description Bluesky supplies.
- No region tabs, no category tabs, no post counts (the public list does not provide them).
- Tapping a topic opens that topic on Bluesky in a new tab, matching the X trend rows.
- No post tile, custom feed, paste field, individual post URL or login.
- Today only; This week hides it. Hidden when the list is empty or the request fails.
- 10-minute cache.
- The Bluesky video row is not in this plan. When it is planned, its home is the existing
  Home row stack in normal row order, not a new top section.

## Research

- `https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=5` returns
  200 anonymously with `access-control-allow-origin: *`; each topic has `displayName`,
  `description` and a `/profile/{did}/feed/{rkey}` link. Tested Nov 25.
- Each link opens `https://bsky.app/profile/{did}/feed/{rkey}`.
- Today already has the same pattern in `src/app.js` (`trendingSection`, `trendHolder`) and
  the same row styles (`.today-section`, `.trend-list`, `.trend-row`). No new CSS expected.
- `src/bluesky.js` already talks to the public Bluesky service for What’s Hot videos.
- No new files, no content-security-policy hash change, no new dependency.

## Checks

- Unit tests for topic parsing: name, description, URL, duplicates, bad links, five-topic limit.
- `node --test tests/*.test.mjs` — all existing tests plus the new ones pass.
- Local Chrome, 1440 px and 390 px: section appears after X trends; five rows; descriptions
  fit; clicking opens the right Bluesky topic; This week hides it; a blocked request hides it;
  the rest of Today is unchanged.
- After push, the same checks on the live site at both widths.
- No test data left behind.

## Steps

- [x] Write and push this plan.
- [x] Add `readBlueskyTopics` / `loadBlueskyTopics` to `src/bluesky.js` with URL normalization,
      10-minute cache and in-flight dedupe.
- [x] Add unit tests for topic parsing.
- [x] Add the section to `fillToday` directly after the X trends holder; fill asynchronously;
      hide on empty, error or This week.
- [x] Run the full test suite (402 pass).
- [x] Check locally at 1440 px and 390 px.
- [ ] Commit, push and check the live site at both widths.
- [ ] Mark this plan DONE, live <date>.

## Gotchas

- The trends list is story topics, not clean categories.
- No post counts are available; do not invent them.
- The section must fail quietly, like the X trends.
- Do not touch Home in this build.
- The heading uses `.match-day` edge-to-edge margins, so its `scrollWidth` is wider than the
  section by 12 px on purpose. That is not clipping.
