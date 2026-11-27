# Phone Live menu

**Status: DONE, live Nov 27 (81afc9a).**

## Goal

The phone's MULTIGRID drop-down gets a **Live** row. It opens the existing Live menu as a
phone sheet with the platforms that actually play on the phone: **Twitch, Kick and YouTube**.
TikTok live is left out because it needs the MULTIGRID Sound extension on laptop Chrome.

**Running cost: $0/month.** No new account, key or service. The same saved folders, status
feeds and add box as the laptop Live menu.

## Defaults chosen

- The row sits after **Reels**, before **Sound**, with a live count when something is on:
  **Live · 2 on now · Twitch, Kick, YouTube**.
- The phone sheet shows **Twitch · Kick · YouTube** only. There is no TikTok tab on the phone.
- Saved channels come from the existing TWITCH, KICK and YOUTUBE folders. The add box accepts
  a URL, `@name`, plain name or live link.
- Tapping a channel adds it to the phone wall; **+** adds another; trash has Undo. The same
  statuses/avatars/viewers and YouTube channel resolution as the laptop menu.
- Pasting a TikTok live link into the phone sheet is refused with:
  **“TikTok LIVE needs laptop Chrome and the MULTIGRID Sound extension.”**
- No Live Room rail on the phone. The desktop Live menu and TikTok rail are unchanged.
- The phone's top bar is unchanged; Live lives in the MG drop-down as requested.

## Research

- iPhone browsers can't install the MULTIGRID Sound extension, and TikTok live playback is
  native only through that extension. TikTok embeds on the phone are blocked, so the TikTok
  tab would only produce error messages. It is omitted.
- Twitch, Kick and YouTube live use normal embeds and play in the phone's wall.
- The Live menu already has the `reels-menu` sheet structure; adding `live-menu` to the phone
  sheet titles makes it a normal phone sheet. The tabs are filtered to the three playable
  platforms; `liveTab` falls back to Twitch when the remembered tab is TikTok.
- No new data source, key or paid service.

## Checklist

- [x] Phone MULTIGRID Live row with live count.
- [x] Live menu as a phone sheet; Twitch/Kick/YouTube only.
- [x] Add via URL/@name/live link, save to the right folder, open on the wall.
- [x] TikTok URL/link refused with the laptop message; no TikTok tab.
- [x] Desktop Live menu and TikTok rail unchanged.
- [x] Full tests (507).
- [x] Local 390/1440 browser checks.
- [x] Live site check, then mark DONE.

Live: the 390 px sheet shows Live, the three tabs Twitch/Kick/YouTube, 44 px form and row actions, and no TikTok or “null”. A Twitch add saved to the phone wall; a TikTok live link was refused with the laptop message. Desktop still shows all four tabs.

## Gotchas

- Do not add the TikTok tab on the phone just to show status; it cannot play. Keep the phone
  sheet to Twitch, Kick and YouTube.
- The phone Live row is a sheet opener, not a new top-bar button.
- The desktop Live Room rail remains laptop-only.
