# Working on MULTIGRID

Rules for every AI agent working on this repo: Claude (desktop or claude.ai/code), OpenCode, Codex. Several agents work on it, so read this first, every session.

MULTIGRID is a personal multiview video app for one person (the owner), live at https://multigrid.club (the old address, thisiseames.github.io/multigrid, forwards there). It is plain ES modules with no build step. GitHub Pages serves `main`.

## Every session
0. Read `notes/owner-rules.md` (how the owner wants work done; cloud sessions don't get these rules any other way), read `notes/product-map.md` (the inventory of what already exists), and skim `notes/history.md` for the part you're touching (what was tried and what broke).
1. Get the latest `main` before touching anything (`git pull`). Another agent may have pushed minutes ago.
2. Run the tests before every commit: `node --test tests/*.test.mjs` (Node 22). All must pass.
3. Pushing to `main` is deploying: the live site updates within a minute or two. Push only finished, tested work, in small commits with plain-English messages that say what changed for the owner.
4. Check the change in a real browser at both laptop width and phone width (about 390 px) before calling it done.

## Where things live
- `extension/`: the MULTIGRID Sound Chrome extension. Chrome on the owner's Mac loads it straight from a clone of this repo (`~/MULTIGRID-extension/extension`, linked at `~/MULTIGRID Sound`), and a launchd job (`com.eames.multigrid-extension`) pulls `main` into that clone every 5 minutes and at login (log: `~/Library/Logs/multigrid-extension.log`). After you push an extension change, bump its version in `extension/manifest.json`, and the only thing to ask the owner is: "Reload MULTIGRID Sound in chrome://extensions (in a few minutes), then reload MULTIGRID."
- `notes/local-setup.md`: the owner's devices, Chrome extensions that affect playback, what's saved in the browser, and where secrets live. `notes/setup-data.json` is a snapshot of the favorites (with links), layouts and Continue watching.
- `notes/todo.md`: ideas waiting for a plan and the owner's go.
- `notes/product-map.md`: every feature the site already has, plus the duplicate traps. Read it before proposing anything.
- `notes/owner-rules.md`: the owner's standing rules for every agent.
- `notes/history.md`: the project's history, decisions and traps found so far.
- If something you need lives only on the owner's Mac and isn't described here, say exactly what and why in one sentence, and add it to the repo once it's provided so no session has to ask again.

## Never
- Never commit secrets: `READER-KEY.txt`, API keys, tokens. Secrets live in GitHub repo secrets, and only the owner adds them.
- Never hand-edit or commit local copies of the job-owned files: `guide.json`, `feeds.json`, `movies.json`, `charts.json`, `shows.json`, `top10.json`, `flights.json`, `highlights.json`, `matchday-reactions.json`, `transfers.json`, `team.json`, `podcast-charts.json`, `catalog.json`, `extras.json`, `reader/index.json`, `reader/a/*`. The GitHub Actions jobs in `.github/workflows/` make and commit them. To test a job locally, run it, then discard its output (`git checkout -- <file>`).
- Never store full article text unlocked in the repo (the Reader keeps it encrypted).
- Never add a paid service, an account sign-up or anything that collects the owner's personal details without the owner's explicit yes.

## The page's security hash
`index.html` has a Content-Security-Policy with a `sha256-…` hash of its own inline `<script type="module">`. If you change that inline script (including its list of files), recompute the hash: take the exact text between `<script type="module">` and `</script>`, sha256 it, base64 it, and replace the `sha256-…` value. A test checks that the file list includes every file in `src/`.

## Outside services in use (all free, no keys)
Open-Meteo, CNBC quotes, TVmaze, Wikipedia/Wikidata, billboard.com, YouTube oEmbed, ESPN, Twitch's preview images, api.ivr.fi (unofficial Twitch info), r.jina.ai (reader used for TikTok, X and trends24; about 20 requests a minute without a key), gamma-api.polymarket.com, iptv-org channel lists, google-flights-ts (in the flights job), Apple's podcast directory (iTunes Search API; about 20 calls a minute, cached in the app) and podcast charts (Marketing Tools RSS, fetched by the hourly podcasts job; no CORS in the browser). Any of these can change or slow down; fail quietly (hide the section) rather than show errors or stale numbers as current.

## No lesser duplicates

Before proposing a feature or API, check `notes/product-map.md`. If the capability already exists, improve it or explain why the new idea is materially different. Never pitch a weaker version of something already shipped (the real failure: proposing 30-second Chart previews when every chart row already opens Watch here, Spotify, Amazon Music and YouTube Music).

## How the owner wants things
- Plain language, no jargon. Times like "2:00 pm". Dates like "Fri, Nov 20", never starting with the year.
- Before building anything new, write a short plan that opens with: running cost per month (with how it's metered), every default you chose ("I decided X, change it?"), what you researched (with sources), and how you'll verify. Then wait for an explicit "go".
- **Never work in silence, and never stop to ask permission mid-job.** Say a one-line update before each batch of tool calls — that text is visible while the tools run — then keep going in the same turn. Do not end the turn after a checkpoint, do not use the `question` tool to pause a job he already asked for, and do not wait for another “go”. Keep working until it is live and checked. Tool output is not a message to the owner. Never say “added”, “ready” or “done” until it is live or visibly tested; say “built locally, not live yet” when that is the truth.
- Build the plain thing that was asked, not something adjacent. No gimmicks (goal celebrations, score alerts and similar).
- **Keep him inside MULTIGRID.** The product wins when the feed, replay, recap, guide, article, podcast, stats or file is already here. Pitch things that bring content or context into the app and work there; do not pitch utilities, cleanup, recovery, settings, or anything whose payoff is opening another tab, app or site.
- **No housekeeping pitches.** Bulk edit, cleanup, folder management, sync setup, link health, import/export and account/settings features are chores. MULTIGRID is not only video: pitch real capabilities in watching, listening, reading, sports data or the daily dashboard; do not reduce the test to “changes what he watches.”
- **Copy the control next door.** Before adding or changing any control in an existing bar, menu or row, match the nearest existing control's height, icon size, label, label line, spacing and alignment. Check a 390 px screenshot before calling it done. If the owner names one symptom, fix the whole control.
- Put new lists inside existing structures (a Favorites folder tab, an existing section) rather than adding new space-eating sections.
- Tickers go at the bottom, never the top.
- Nothing may overlap a Twitch player (Twitch stops playback when covered).
- "Done" means you saw it work on the live site, at laptop and phone width.
