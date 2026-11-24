# More like this from a job

**Status:** built; live after push. X-Ray uses the job file first, extension second. The initial `similar.json` is the job's own generated output; `guide.yml` refreshes it weekly.

## Why

The extension-only path failed on the owner’s laptop: the row was completely absent. The phone can never use the extension. The data is public JustWatch GraphQL, so it can be fetched by the same guide job that builds recaps and extras.

## What

- `tools/build-similar.mjs` asks JustWatch for the 48 Series favourites from `notes/setup-data.json`, parses the same neighbours as `src/similar.js`, and writes job-owned `similar.json` weekly.
- `guide.yml` runs it after recaps and commits `similar.json`.
- X-Ray loads `similar.json` first for a show and only asks the extension if the file has no rows for it.
- `More like this` / “Because you’re watching …” now works on laptop and phone for Series favourites, including MobLand, without the extension.

## Cost

**$0/month.** JustWatch’s public GraphQL is free and keyless; the job runs on the existing public GitHub Actions minutes. No new service, account or key.

## Defaults

- Series favourites only (the same 48 the recaps job uses); other shows still use the extension on laptop.
- Up to five rows, same filter as before: same kind, current show excluded, real picture and score, quality floor, genre overlap.
- Weekly refresh; a failed show keeps its old entry.
- The section stays hidden when both the job and extension have nothing.

## Verify

- Run the job locally; MobLand must return neighbour rows, and `similar.json` stays job-owned.
- Open X-Ray on the laptop with no extension answering: More like this appears.
- Open X-Ray on the phone: the same rows appear from `similar.json`.
- A non-favourite show with no job entry still falls back to the extension on laptop.
