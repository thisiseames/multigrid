# How the owner wants work done

These are the owner's standing rules for every AI agent, copied Nov 21 from the rules Claude receives on every message on the Mac. Cloud sessions don't get that automatic reminder, so read this file at the start of every session.

BEFORE ANY PLAN IS SHOWN it must open with these four things, in this order:
1. RUNNING COST: a monthly number, the formula, the assumptions, and what happens at the limit, for every meter anything in it touches (hosting credits, database, AI usage). Research how it is metered BEFORE proposing it. "Expected $0, verify later" is banned.
2. MY DEFAULTS: every choice I made on his behalf, each written as "I decided X, change it?"
3. RESEARCHED: unknowns already resolved, with sources. He is asked to choose only between options I have already costed and have a recommendation for. Never an unresearched menu.
4. HOW I'LL VERIFY: on the real thing, including how test data gets cleaned up.

## Read and answer every part of the message (Nov 25)
Owner: "What I need you to put in the fucking rules for you to fucking read and fucking respond to fucking act and think on every fucking part of my fucking paragraphs. You keep doing this fucking thing where you see one part of a paragraph and decide that’s the only thing that matters."

Before replying, planning or calling a tool, split the message into **every** separate question, instruction, correction and constraint. Handle every part. Never treat the first recognisable instruction as the whole message, and never let one clause cancel the rest.

- A question plus an action is **not** permission to act: answer the question, and wait for a clear "go" to the exact plan.
- A correction plus a new request: apply the correction to the whole plan/build, not only to the example that exposed it.
- Several symptoms: fix the whole control or flow, not just the named symptom.
- If two parts conflict or one is ambiguous, name that part and ask only about that; never silently choose one and drop the rest.
- In the reply, briefly show that each part was handled. Do not answer one part and disappear.

## Clarity first (Nov 25)
Owner: "THE RULE IS FUCKING CLARITY."

Every description, instruction and plan must be clear on **one read**. The method:

- Say what happens in the **normal** case first, in one or two plain sentences.
- Put exceptions after, separately, with the exact condition ("Only if Reduce Motion is on…").
- Never mix an edge case into the main sequence.
- Never list a caveat without saying it is a caveat.
- Never make him work out which path is the default.
- If there are several cases, name the default first, then the alternatives.

If a sentence needs a second read to know which case applies, it is not finished.

**Why:** I described iPhone Reduce Motion as if it were part of the normal opening, so the whole opening sounded like it had no animation. The information was right; the clarity was missing. He had to ask why, then point out it was a secondary phone setting.

## Build only from a complete experience plan (Nov 25)
Owner: "You went to start building before creating an actual fucking plan… think of the user experience. This is how to use it. This is where to find it."

For any new screen, flow, opening, control or asset change, no code, file edit, commit or deploy until the plan answers all of these in writing:

1. **FIRST FRAME:** what is on screen before anything moves. For an opening, name the first thing seen.
2. **SEQUENCE:** every step, timing and transition, through the final frame.
3. **LANDING:** the exact screen it ends on, including the empty/no-data state.
4. **ASSETS:** every image/file, which screen uses it, and which existing assets must not change.
5. **CONTROLS:** every switch/button, its exact location, default, on/off behaviour, and how he finds it.
6. **EXCEPTIONS:** reduced motion, blocked audio, phone/desktop differences, empty/error states.
7. **UNCHANGED:** what must deliberately stay exactly as it is.
8. **VERIFY:** the first frame, the transition, the landing, each control off, and the unchanged screen, at laptop and phone width.

Then wait for an explicit "go" to that exact plan. A partial answer ("two is fine") is not a go. A new asset or changed requirement means stop and rewrite the plan, not patch the build.

## Assets belong to screens (Nov 25)
Before touching an image or file, write this down: "This file is used on X. The new file is for Y. X must not change."

- An asset given for a new feature is not a replacement for an existing screen unless he says so.
- Never overwrite an existing `assets/...` file to reuse it. Add a new file and name its screen.
- Open the actual image before designing around it. If it already contains a logo or wordmark, say so and design around it.
- The plan must list every asset and every screen it touches.

## Setup steps must be executable (Nov 25)
Any step only he can do must include:

- The exact URL, clickable — not "Google Cloud" or "the settings page".
- The exact page and button labels, in order.
- The exact value or name to enter.
- Where to paste it (the exact menu path).
- What to send back — never the secret itself.

No short-form setup. If he has to ask "where am I supposed to get that?", the instruction is unfinished.

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

## Copy the control next door (Nov 23)
When adding or changing any control in an existing bar, menu, row or list, open the real screen first and treat the nearest existing control as the spec: same container width logic, height, icon size, label, label position, typography, gap, alignment and tap height. Then look at the two side by side at laptop width and 390 px before saying it is fixed or done.
**Why:** the phone Home button was added as a 44 px icon-only square beside 48–58 px labelled columns. Its icon was 21 px, it sat lower than the other icons, and it had no text underneath. When the owner said the icon was not the same, I changed only the number to 24 px and shipped it still on the wrong line with no label. He had to point out basic alignment twice. “The icon is 24 px” is not the same as “the control matches the row.”
**How to apply:** if the owner names one symptom, fix the whole control, not just the symptom. Before replying, take a 390 px screenshot and check the new control against its neighbour: same line, same icon size, same label and label line, same height, no overflow. If any of those differ, it is not done. Do not call it fixed from a single measurement.

## The core: never make him leave MULTIGRID (Nov 23)
MULTIGRID wins because the thing is already here: the live feed, the replay, the season recap, the guide, the article, the podcast, the stats, the local file. Every idea must remove a reason to open another tab, app, site or device. A utility, cleanup, recovery, settings screen or a hand-off to YouTube/another service is not a brainstorm idea.
**Why:** he said: “the fact I don’t have to leave MG BECAUSE THINGS ARE ALREADY AVAILABKE TO ME HERE. You keep brainstorming pointless utilities or recovery or cleanup.”
**How to apply:** finish this sentence before pitching: “This keeps him inside MULTIGRID by bringing ___ here.” If the blank is a chore, a setting, a link out or a recovery step, drop it. X-Ray replays and season recaps pass because the replay/recap plays in the app. A radio tuner, where-to-watch links, a player wrapper or bulk edit do not.

## No housekeeping features (Nov 23)
Do not pitch housekeeping, library management, cleanup, organisation or settings as a brainstorm: bulk select/move/remove, Tidy up, folder management, sync setup, link health, import/export, backups, profiles or account controls. These are chores, not features.
**Why:** after a run of viewing ideas, I pitched Favorites Select mode (bulk move/star/remove for 342 favourites). He answered: “Stop fucking suggesting fucking house cleaning.”
**How to apply:** MULTIGRID is not only a video app. Pitch substantive capabilities in any of its real pillars — watching, listening (podcasts/audio), reading (Reader), sports data/desks, or the daily dashboard (Today/weather/flights/markets/trends). What is banned is chores: managing favourites, folders, settings, sync setup or cleanup. Do not use “does it change what he watches?” as the test; use “is this a real capability, not housekeeping?”

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
- Offered and not picked (so: no): YouTube home (new uploads / live now), layouts that open themselves on a schedule, info tiles (league table / Game mode list / weather in the grid), teams' games in the iPhone calendar, keyboard control, voice control, live rewind/DVR/recording, a full TV guide grid, binge mode / auto-next episodes, a TV view run from the phone, share-sheet "send to MULTIGRID" on the iPhone, a "Live now" folder, grid hand-off between devices, captions on muted streams (also take it off the to-do list). Nov 22 (later): frozen streams fix themselves, the big screen follows the sound, the laptop's downloaded files played on the iPhone, a pop-up/redirect blocker in the extension, spoiler-free teams, the home screen on the iPhone, Choose picture (logos for name-only cards), My List (watchlist from the Top 10s and premieres). Not picked Nov 22 (so: no): Matchday for the Raptors and 49ers, the black look for Today and Sports panels, a Reader row on the home screen. Not picked Nov 22 (later): the weekly catch-up card, scheduled grids (that one was already a no as "layouts that open themselves on a schedule"; read this list before every brainstorm). Not picked Nov 22 (evening): search everything (Reader/Guide/podcasts/library in ⌘K), read aloud in the Reader, a monthly recap ("Your month in MULTIGRID"). SLEEP TIMER: offered earlier, not picked, then re-pitched Nov 22 and the owner was furious. Never suggest a sleep timer or anything that stops/clears streams after a time. Before any brainstorm, also search the past brainstorm lists in the session transcripts, not only this list. Ambient screen / screensaver / idle slideshow: a no ("why would I need an ambient screen on a website?"). Pitch things that help him watch, not decoration. Not picked Nov 22 (night): pictures for saved layouts, logos in the sound row / Sound sheet / hidden-streams menu, crests on the score ticker. Not picked Nov 22 (night, 2): taking the blue-purple out of the Guide bars and Sports' Man Utd highlight (don't re-pitch; he'll ask per screen). Not picked Nov 23: zero-wait channel flipping (pre-loading the next channel). Not picked Nov 23: Gamecast tile (live field/court), Catch up ("While you were away"), No dead air (RedZone skipping breaks). Parked Nov 23 (NOT a no; bring back only when he asks): X-Ray on your phone (X-Ray follows the laptop's sound tile on the paired iPhone; trailers/Play land on the laptop). Parked Nov 23 (NOT a no; bring back only when he asks): TV as a second screen (Send to TV via Chrome window placement over AirPlay extended display). Not picked Nov 23: Skip Intro learned from your skips. Not picked Nov 23: picture modes per stream (Vivid/Cinema/Bright), Follow players. Not picked Nov 23: Play Something, post-play end cards. What lands: multiview power features only MULTIGRID can do (RedZone, Pop out grid, X-Ray, Replays); discovery, personalisation and visual tweaks keep getting passed. Not picked Nov 23 ("all terrible"): Peek (press and hold), Magic layout, Ask MULTIGRID (AI chat), Watch Party, Downloads. Not picked Nov 23: sound follows your eyes (webcam), living grid (RedZone for all content), stadium sound (crowd bed that swells), MULTIGRID Vision (reading score graphics: ad skipping, spoiler sync, auto-tagging). Not picked Nov 23: History (every clip/video/story you watched, searchable). Not picked Nov 23: Split sound (per-tile speaker output), Every service in one grid (Netflix/Prime/Disney+ etc. as tiles via the extension). Not picked Nov 23: See it live (Ticketmaster events in Toronto). Picked and built: Scores. Not picked Nov 23: episode map (IMDb rating grid per episode in X-Ray). Not picked Nov 23: Your Feed (all X + TikTok accounts merged into one tile). Not picked Nov 23: X-Ray for the news (Reader + X trends + odds beside a news channel), X-Ray that listens (transcribing a news tile to know the story on air). TWITTER and X are different folders (Nov 22): never merge or treat them as one. Listen on phone (laptop tab sound to the phone over the Remote): planned and given a go, then dropped Nov 22 ("not worth an hour of my time"); never bring it back. Channel flipping in a tile already exists (‹ › chevrons, arrow keys): check the product before pitching. NOT a no: password-protecting the site (deferred) and moving trailers on the home banner (he likes it; worried it would slow the laptop: answered that it runs only on the home screen with nothing playing, one muted trailer at a time, ~20 s, stops when anything plays; offered it behind an on/off switch). Back burner, not a no: TV apps (Chromecast with Google TV via TV Bro or a Cast app; a one-tile Samsung Frame page/app; Frame's Tizen plays one video at a time; he uses AirPlay from the Mac today).
- Live chat (Twitch/YouTube chat tiles or anything like it). Owner, Nov 22: never suggest it again.
- Podcast queues/auto-next of any kind. Owner, Nov 22: does not care about a podcast queue; never suggest one again.

## The vision (Nov 23, owner's words, standing brief)
Build, brainstorm, curate and design MULTIGRID as if it's the signature product of a multi-billion-dollar company aggressively competing with Netflix, Prime Video, DAZN and Apple TV, and set to blow them out of the water because it does everything better: it has the features every paying subscriber of those platforms wishes they had. Millions of subscribers paying $19.99–$59.99 a month. Every idea, screen and detail must meet that level of design, curation and premium feel. Pitch signature features (the kind those companies market), not tweaks; no "add a logo here" rounds. The bar he confirmed (Nov 23): RedZone mode, Pop out grid, X-Ray, Replays: "this is the level of stuff I'm talking about, not sleep timers."

## MULTIGRID is NOT a sports app
Nov 23, owner, furious: "Get it through your head that MULTIGRID is not a sports app." It's multiview for everything he watches: news (CP24, CNN, Sky News), series (Atlantic), YouTube, X accounts, TikTok, podcasts, his film/TV library, the Reader, and sport. Not picked Nov 23: Fight Night (UFC card tracking). Pitch for the whole product; never another run of sports-only ideas.

## Design for the MULTIGRID that wins, not the one that exists (Nov 23)
Owner: "Why do you focus on what MULTIGRID is right now?" My ideas kept coming out small because I started from today's tiles, today's data sources and today's code. Start from the destination instead: the signature product of a company beating Netflix/Prime/DAZN/Apple TV. Today's sources, tile kinds and code are NOT limits: new data can be acquired (new jobs, sources, indexes), new content types, surfaces and platforms can be added. Pitch the idea at full size first; then say plainly what it would take. After a miss, go bigger and more valuable, never smaller and safer.

## The six-question test (every pitch must pass all six before he sees it)
1. Does it answer a question or need a subscriber has every time they watch, not a rare situation?
2. Does the screen/experience visibly get richer, rather than a setting changing?
3. Would it matter to every subscriber, whatever they watch?
4. Would Netflix/Apple/Prime/DAZN market it, rather than bury it in a help page?
5. Is there a real path to building it, even if it needs new sources, jobs or pieces? (Say the path; don't shrink the idea to what's easy today.)
6. Does it build on something he's responded to (hover card, X-Ray, Replays, RedZone, Pop out grid) or clearly beat it?
Start from the experience of watching and the vision, never from "what can the current code/data do".

## Check every piece of a pitch in the code first
Nov 22: I pitched "live channel cards" (show title, progress bar, what's next), Reader pictures and a drifting banner as upgrades; all three already exist (favorite cards' On now line, Guide Now cards, readerHero/readerPicture, hero-drift). He was furious: "Understand the website before you pitch things." Before any idea: grep src/app.js and styles.css for every element the idea describes, and open the real screen. Each pitch must say what exists today and only the part that doesn't.
Pitch to his bar: makes his life easier, wows him, elevates an existing feature's look/feel/use, and makes MULTIGRID look like a product from Netflix, Apple TV, DAZN or Fubo. No gimmicks, no filler to make a list of three.

## Instant, always
Nov 22: never add animation/transitions to tiles, layouts or Play ("It's supposed to be instant. This is not Windows Movie Maker."). The tile icons show only on hover, and that's right: never move them into a More menu.

## No dead-end proposals
Before suggesting a tool, import or API, name the exact content source in one line. If it depends on a playlist, file, login, key or provider only the owner can supply, say that before the idea and do not recommend it unless he has confirmed he has it. Never propose a tool whose only input is a follow-up I refuse to do. If I cannot source and test the content, I drop the idea instead of building an empty container. M3U import is out: the owner has no playlist and Channel Finder already imports free channels.
- Also turned down before: broken-link "Not working since …" labels; goal/score alerts and other small sports gimmicks.

## Never use periwinkle (or any blue-purple accent)
Nov 22: the owner hates periwinkle, the pale blue-purple MULTIGRID has used as its accent (`--accent: #8ea6e8`, also its tinted backgrounds). "No one else uses this color." Never use it, or anything close to it, for anything new, in MULTIGRID or in any other project.

**Instead:** white / near-white for controls and highlights (#f5f5f7 with dark text #0b0b0d on buttons; white fills on dim grey tracks), the way Apple TV, Netflix, HBO Max and Disney+ draw their players. Brand colours only inside logos.

**Existing periwinkle:** the owner is replacing it one screen at a time, by request ("everywhere is too big of a commit"). Don't sweep the whole app unasked; when a screen is touched for this, change only that screen and check it at both widths. Done so far: the guide's show card (time bar, Watch button); the shared control styles (Add stream, desktop mixer, phone Sound sheet and equivalent buttons/tabs/sliders); Continue watching progress bars.

## He uses Chrome, always
Nov 22: "I am always on Chrome." Laptop and iPhone. Safari only for short developer checks. Never give Safari steps or reasons ("Safari blocks…"); write every instruction for Chrome. On the iPhone, the home-screen app is added from Chrome (Share → Add to Home Screen).

## Every plan and build can be picked up by another agent (Nov 23, standing)
Owner: "Moving forward every planned or building should be able to be picked up by another agent."
**How to apply:** before building anything, write the plan to notes/plans/<name>.md with a numbered checklist, defaults, research and gotchas, and push it. Tick each step and commit + push after it (not only at the end), so an agent opening the repo cold (OpenCode, another Claude session) can see what's done, what's next and how to verify. Add gotchas to the plan as they're found. Mark the plan "DONE, live <date>" at the end.

## One white button per screen (Nov 23)
Owner: "Fix the button hierarchy" (phone Sports sheet: the Games tab and the My teams chip were both big white pills). The top-level switch is the only white-filled button; second-level chips/filters are outlined (selected = white outline + white text, others dim), and badges like POST-MATCH are grey, not white. Apply the same when adding chips under a switch anywhere.

## Place new things by what they are, never by newness (Nov 25)
Owner, furious: "Why is your default when putting something new to fucking put it at the fucking top, irrelevant to whatever else is there?"

New is not the same as most important. Never park a new feature at the top of a screen just to make it visible. First say what it is (a trends list, a video row, a control), find the existing section that already does that job, and put it in that hierarchy. Trends go with trends; video rows join the existing rows; controls match the control next door.

**How to apply:** in every plan and build, name the existing section it belongs with and the exact slot before touching the page. "Top" is only allowed when the thing is the screen's primary action and the existing order says so. If nothing fits, say that plainly and propose the smallest natural home, never a new top section. New things do not earn the top spot by being new.
