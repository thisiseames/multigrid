# Phone opening: MULTIGRID logo + sound

**Status:** building. Owner approved two switches and asked for the animation to be the first
thing seen, over the collage.

## Running cost

$0/month. No new service, account, key or file. The logo is the existing wordmark animation;
the sound is the existing generated Web Audio sting; the background is the existing collage.

## Defaults

- On a full phone launch, the collage fills the screen and the MULTIGRID wordmark draws together
  (1.6 s), then fades to the app.
- The collage stays as the empty-wall background after the splash.
- Resuming from the background does not replay it; only a fresh page launch does.
- **Opening logo** switch in the MULTIGRID menu, on by default.
- **Opening sound** switch shown on the phone too, on by default. Desktop keeps its switch and
  its empty-wall behaviour.
- Desktop does not get the new splash; its existing empty-wall logo and sound are unchanged.
- If iOS blocks audio on a cold launch, the logo still plays and the sound is silent; no fake
  workaround.

## Research

- `src/sting.js` already generates the 1.6 s sound and has `isStingOn` / `setStingOn`.
- The phone currently hides the big empty-wall wordmark and skips `playSting`.
- The collage is `assets/empty-wall.jpg` with the phone empty-wall gradients in `styles.css`.
- The MULTIGRID menu already has an **Opening sound** switch, but it is hidden on phone.
- The inline module script in `index.html` has a CSP hash that must be recomputed after editing.

## Checks

- Unit tests and all 402 existing tests pass.
- Phone 390 px, fresh load with logo on: first paint is the collage + wordmark animation, then
  the app; the collage is still the empty-wall background.
- Logo off: no splash; app appears immediately, with no flash of the logo.
- Sound off: splash silent. Sound on: `playSting` is attempted; blocked audio is silent.
- Desktop 1440 px: no phone splash; existing empty wall unchanged.
- Live site at both widths after push.

## Steps

- [ ] Write and push this plan.
- [ ] Add the splash markup and phone CSS using the collage.
- [ ] Add the early logo-off check before the body is revealed; recompute the CSP hash.
- [ ] Add the logo/sound switches to the MULTIGRID menu.
- [ ] Start the splash and sting from `app.js`; remove it after the fade.
- [ ] Run tests; check phone and desktop locally.
- [ ] Commit, push, check live; mark DONE.

## Gotchas

- `body` is `visibility:hidden` until the inline script reveals it. The splash must be removed
  before that when the logo setting is off, or the logo flashes.
- CSP hash must be recomputed after changing the inline script.
- iOS will usually block the cold-launch sound; the logo is the reliable part.
