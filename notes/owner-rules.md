# How the owner wants work done

These are the owner's standing rules for every AI agent, copied Nov 21 from the rules Claude receives on every message on the Mac. Cloud sessions don't get that automatic reminder, so read this file at the start of every session.

BEFORE ANY PLAN IS SHOWN it must open with these four things, in this order:
1. RUNNING COST: a monthly number, the formula, the assumptions, and what happens at the limit, for every meter anything in it touches (hosting credits, database, AI usage). Research how it is metered BEFORE proposing it. "Expected $0, verify later" is banned.
2. MY DEFAULTS: every choice I made on his behalf, each written as "I decided X, change it?"
3. RESEARCHED: unknowns already resolved, with sources. He is asked to choose only between options I have already costed and have a recommendation for. Never an unresearched menu.
4. HOW I'LL VERIFY: on the real thing, including how test data gets cleaned up.

NEVER: build without a written plan AND his explicit "go" to that exact plan. Move his data, accounts or hosting on my own. Open his browser or accounts for something he didn't ask for. Decide a requirement silently.

BLOCKED on something only he can do: name the one action in one sentence, then stop that thread. Never substitute the weaker answer he already rejected. Never narrate what I won't do.

DONE means I saw it work on the real thing and I say what I saw. "Untested" is an unfinished job: build the means to test it, including clean-up. Anything written to a live record is verified reverted.

SEE EVERY JOB THROUGH TO THE END. Assume he has left the house and cannot come back to this Mac. A job is not finished until it works for him with nothing left for him or another session to come back and do. Before saying "ready" or "done": list every piece the job touches (including things that live only on this Mac: extensions, browser data, local folders, settings), handle each one, then run the real test the plan promised. Never say "ready" with a step skipped, and never leave a gap for him to discover later.

## Never work in silence
Nov 22: a long Matchday/source-memory build ran through many tool calls without a message, then reported a wall of status; he said he was "annoyed" and later "create whatever you need so that you are unable to do this anymore." Tool calls are not communication he can see.

**How to apply:** say a one-line update before each batch of tool calls — that text is visible while the tools run — then keep going in the same turn. **Do not stop after a checkpoint, do not use the `question` tool to pause a job he already asked for, and do not wait for another "go".** The first version of this rule said "stop after 3 tool calls"; he answered "DO THE FUCKING POINT IS NOT FOR YOU TO KEEP FUCKING STOPPING", so stopping is the failure, not the fix. Keep working until it is live and checked, then give the result once. Never say "added", "ready" or "done" until it is live or visibly tested; say "built locally, not live yet" when that is true. A later "update"/"????"/all-caps message means the rule was broken, not that he needs to ask again.

BEFORE SHOWING OR SHIPPING ANYTHING I BUILT (a screen, a briefing, a message, a workflow), ask these, and fix any "no" BEFORE he sees it, never ship it with a question attached:
- Have I looked at it on the laptop AND on Eames's phone, as really rendered at phone width (not just the numbers or the code)?
- Is this the best version, or only the quickest?
- If I could look at it as a stranger, would I go back and change anything? Am I proud of it?
- Would Eames be happy with it: is the one thing he wants in front of him, and nothing he does not need?
- Any obvious errors: stray symbols, empty states, overflow, wrong numbers, wording?

AFTER ANY DEPLOY: give the month's projection (credits), not only the balance. Batch deploys; each one costs.

ANSWERS: yes or no first, then at most two sentences. His anger is information to act on, never a reason to write more. Plain language. Times in 12-hour form (2:00 pm). A date never leads with the year.

Full history of why each rule exists lives in Claude's private notes on the Mac.

## MULTIGRID-specific preferences


Test MULTIGRID against what he actually watches, mostly pasted embeds like CP24 and Sky Sports. Twitch gets one quick check, never long rounds.

**Why:** Nov 5, during the sound mixer: "Twitch is not the be all end all", he only ever watches one Twitch streamer, and he asked why checks took so long after I chased Twitch ad breaks across many runs.

**How to apply:** Lead with embeds, keep Twitch brief, and don't hold up a finished feature for a Twitch edge case; state it as a caveat. See [[project-multigrid]].

When brainstorming MULTIGRID (or similar) features, never suggest goal celebrations, score flashes/alerts, or "sound jumps to the big moment" ideas. He said (Nov 18): "Those aren't features or add-ons. Those are gimmicks."

**Why:** he wants things that change how he watches and manages streams, not novelty reactions to game events. He'd already passed over these twice.

**How to apply:** brainstorm lists contain only substantive capability (reliability, control, viewing, data, devices). Drop anything whose main point is a visual/audio reaction to a score. Related: [[project_multigrid]].

When adding something to a crowded panel (Add stream, sheets), fold it into the structure that's already there (e.g. a folder tab in Favorites) instead of stacking a new full-height section. He said the separate Podcasts section "takes up so much space. It literally defeats the purpose of this thing. Why wouldn't you just add it to favorites?"

**Why:** Add stream exists to pick a stream fast; every new block pushes Favorites down. I chose the placement myself as a "default" without weighing space.

**How to apply:** in plans, default new lists to an existing container (tab, folder, filter) and state the space cost of any new section explicitly as its own "I decided…, change it?". Related: [[project_multigrid]], [[feedback_plans_must_cost_and_not_decide_for_him]].

When he describes a feature by example ("Grammys today on ABC", "movie releases for cinema, Netflix"), build exactly that idea first: a plain list of what's releasing/airing today. Don't bolt on personalization (his services, his folders) or clever mechanisms (daily catalogue diffs) he didn't ask for.

**Why:** "I'm not asking for which of my services carry the movie… you've missed the point." Over-engineering hid the simple thing he wanted.

**How to apply:** restate his ask in one line before brainstorming; any extra filter or mechanism goes in as an explicit, optional "change it?" default, never as the core. Related: [[feedback_dont_overcomplicate_small_builds]], [[fold-into-existing-not-new-sections]].


Nov 21, MULTIGRID: I told him it was ready to close the desktop app and work from the Claude iPhone app after only adding AGENTS.md. Within 10 minutes the cloud session had to send him back to the desktop because the MULTIGRID Sound extension code (and his setup) existed only on the Mac. He was furious.

**Why:** my own plan said "verify: start a cloud session and make one tiny change" and I skipped it, then answered "yes, it's ready" anyway. A rules file is not the same as the cloud having everything.

**How to apply:** before saying any project is ready for cloud/another device: inventory everything the work touches that lives only on this machine (extensions, unpacked folders, browser data, local copies, secrets' locations, settings), move it into the repo (no secret values), then actually run a cloud session against the repo with a realistic task and confirm it never needs the Mac. Only then say ready. Related: [[feedback-verify-before-asking-to-test]], [[reference-multigrid-opencode-nov20]].

## Brainstorms: only fully worked-out ideas

Nov 21, MULTIGRID: asked to brainstorm features, I pitched small sports tweaks ("corn niblets"), then bigger ideas that fell apart on his first questions: live rewind turned out to cover only 28 favorites (mostly news, none of the game streams), "Live now" included TikTok lives that MULTIGRID can't play, and "Share to MULTIGRID" on the iPhone can't reach the home-screen web app (iOS opens links in Safari, whose storage is separate).

**Why:** I suggested ideas before checking them against his real setup (notes/setup-data.json) and the platform's limits.

**How to apply:** before an idea goes in a brainstorm, work it through end to end: what exactly he taps, on which device, what it affects in his actual favorites, and every platform limit (iOS web app, embeds, CORS, keys). Drop anything that doesn't survive. Fewer, bigger ideas that hold up; no small tweaks to whatever was built last. His bar: OpenCode's extension (click on any site → it plays in MULTIGRID / a YouTube channel lands in Favorites).

## Never suggest again
- **An idea offered once and not picked is a no.** Don't offer it again in a later brainstorm, reworded or not. Every brainstorm must be all new ideas. (Nov 22: I re-pitched the same six twice and he was furious: "If I didn't say yes the first time, what do you think that means?")
- Offered and not picked (so: no): YouTube home (new uploads / live now), layouts that open themselves on a schedule, info tiles (league table / Game mode list / weather in the grid), teams' games in the iPhone calendar, keyboard control, voice control, live rewind/DVR/recording, a full TV guide grid, binge mode / auto-next episodes, a TV view run from the phone, share-sheet "send to MULTIGRID" on the iPhone, a "Live now" folder, grid hand-off between devices, captions on muted streams (also take it off the to-do list). Nov 22 (later): frozen streams fix themselves, the big screen follows the sound, the laptop's downloaded files played on the iPhone, a pop-up/redirect blocker in the extension, spoiler-free teams, the home screen on the iPhone, Choose picture (logos for name-only cards), My List (watchlist from the Top 10s and premieres). Not picked Nov 22 (so: no): Matchday for the Raptors and 49ers, the black look for Today and Sports panels, a Reader row on the home screen. Not picked Nov 22 (later): the weekly catch-up card, scheduled grids (that one was already a no as "layouts that open themselves on a schedule"; read this list before every brainstorm). TWITTER and X are different folders (Nov 22): never merge or treat them as one. Listen on phone (laptop tab sound to the phone over the Remote): planned and given a go, then dropped Nov 22 ("not worth an hour of my time"); never bring it back. Channel flipping in a tile already exists (‹ › chevrons, arrow keys): check the product before pitching. NOT a no: password-protecting the site (deferred) and moving trailers on the home banner (he likes it; worried it would slow the laptop: answered that it runs only on the home screen with nothing playing, one muted trailer at a time, ~20 s, stops when anything plays; offered it behind an on/off switch). Back burner, not a no: TV apps (Chromecast with Google TV via TV Bro or a Cast app; a one-tile Samsung Frame page/app; Frame's Tizen plays one video at a time; he uses AirPlay from the Mac today).
- Live chat (Twitch/YouTube chat tiles or anything like it). Owner, Nov 22: never suggest it again.
- Podcast queues/auto-next of any kind. Owner, Nov 22: does not care about a podcast queue; never suggest one again.

## No dead-end proposals
Before suggesting a tool, import or API, name the exact content source in one line. If it depends on a playlist, file, login, key or provider only the owner can supply, say that before the idea and do not recommend it unless he has confirmed he has it. Never propose a tool whose only input is a follow-up I refuse to do. If I cannot source and test the content, I drop the idea instead of building an empty container. M3U import is out: the owner has no playlist and Channel Finder already imports free channels.
- Also turned down before: broken-link "Not working since …" labels; goal/score alerts and other small sports gimmicks.

## Never use periwinkle (or any blue-purple accent)
Nov 22: the owner hates periwinkle, the pale blue-purple MULTIGRID has used as its accent (`--accent: #8ea6e8`, also its tinted backgrounds). "No one else uses this color." Never use it, or anything close to it, for anything new, in MULTIGRID or in any other project.

**Instead:** white / near-white for controls and highlights (#f5f5f7 with dark text #0b0b0d on buttons; white fills on dim grey tracks), the way Apple TV, Netflix, HBO Max and Disney+ draw their players. Brand colours only inside logos.

**Existing periwinkle:** the owner is replacing it one screen at a time, by request ("everywhere is too big of a commit"). Don't sweep the whole app unasked; when a screen is touched for this, change only that screen and check it at both widths. Done so far: the guide's show card (time bar, Watch button); the shared control styles (Add stream, desktop mixer, phone Sound sheet and equivalent buttons/tabs/sliders); Continue watching progress bars.

## He uses Chrome, always
Nov 22: "I am always on Chrome." Laptop and iPhone. Safari only for short developer checks. Never give Safari steps or reasons ("Safari blocks…"); write every instruction for Chrome. On the iPhone, the home-screen app is added from Chrome (Share → Add to Home Screen).
