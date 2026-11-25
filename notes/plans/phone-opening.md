# Phone opening: MULTIGRID logo + sound (plan 2)

**Status:** DONE, live Nov 25.

## Running cost

$0/month. No new service, account, key or file. The logo is the existing wordmark style; the
sound is the existing generated Web Audio sting; the opening background is the plain collage.

## Defaults

- On a full phone launch the screen is near-black. The MULTIGRID wordmark is the first thing
  seen; it draws together for 1.6 s, holds, then fades.
- The app appears on Streams, or on the existing logo collage empty wall when there are no streams.
- The existing logo collage stays as `assets/empty-wall.jpg` and remains the phone empty wall.
- The plain collage is a separate `assets/opening-collage.jpg`, used only by the opening.
- Desktop is unchanged: no phone splash, same empty-wall logo and sound.
- Resuming from the background does not replay it; only a fresh page launch does.
- **Opening logo** switch in the MULTIGRID menu, on by default.
- **Opening sound** switch shown on the phone too, on by default. On desktop it keeps its
  existing empty-wall sound behaviour.
- If iOS blocks audio on a cold launch, the logo still plays and the sound is silent.

## Research

- The existing logo collage stays as `assets/empty-wall.jpg` (926×2000) for the phone empty wall.
  The plain collage is saved as `assets/opening-collage.jpg` (768×1376) and used only by the splash.
- `src/sting.js` already generates the sting and has `isStingOn` / `setStingOn`.
- The opening logo is a separate stored switch (`multigrid.openinglogo.v1`).
- The inline module script in `index.html` removes the splash before the body is revealed when
  the logo switch is off. Its CSP hash was recomputed.
- The phone splash timer starts after the animation begins, so the 2 s hold is not counted
  during app start-up.

## Checks

- Phone 390 px: first frame is near-black with the wordmark visible; it draws to full white;
  then the app and the logo collage wall. No second logo during the opening.
- Opening logo off: no splash and no flash of the logo; app appears immediately.
- Opening sound off: splash silent. The switch stores `off`.
- Reduce Motion: no animation; logo static; short hold and fade.
- Desktop 1440 px: no phone splash; existing layout unaffected.
- 402 tests pass.
- Live checks: phone 390 px shows the wordmark first, then the plain opening collage, then the logo collage wall and app; desktop 1440 px has no phone splash; the menu shows both switches.

## Steps

- [x] Plan and asset.
- [x] Splash markup, CSS and wordmark-first animation.
- [x] Logo/sound switches in the MULTIGRID menu.
- [x] Start-up timer and early logo-off check; CSP hash.
- [x] Local phone, desktop, Reduce Motion and switch checks.
- [x] Commit, push, check live at 390 px and 1440 px.
- [x] Mark DONE, live Nov 25.

## Gotchas

- The wordmark starts at 40% opacity so it is visible immediately; it is not a blank black
  first frame.
- The splash removal timer runs from the animation start, not from page load.
- `empty-wall.jpg` is the logo collage for the clear-all wall; `opening-collage.jpg` is the
  plain opening image. Never swap or overwrite them.
- iOS will usually block the cold-launch sound; the logo is the reliable part.
