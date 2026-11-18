// The page a popped-out stream plays in (see popout.js). It builds the same player a tile uses.
import { createPlayer } from './players.js';
import { parseSource } from './sources.js';

const box = document.getElementById('pop');
let wanted = null;
try {
  wanted = JSON.parse(decodeURIComponent(location.hash.slice(1)));
} catch { /* nothing to play */ }
const source = wanted?.input ? parseSource(wanted.input) : null;
const env = { hostname: location.hostname, origin: location.origin, protocol: location.protocol };
const showError = (message) => {
  const note = document.createElement('p');
  note.className = 'pop-error';
  note.textContent = message;
  box.replaceChildren(note);
};

if (!source?.ok) {
  showError("This stream can't be played here.");
} else {
  const player = createPlayer(source, {
    muted: Boolean(wanted.muted),
    volume: Number.isFinite(wanted.volume) ? wanted.volume : 100,
    autoplay: true,
    env,
    describe: () => ({ input: wanted.input, name: wanted.name || source.label }),
    onError: showError,
    onCapability() {},
    onPlayState() {},
  });
  if (player) {
    const frame = document.createElement('div');
    frame.className = 'pop-player';
    frame.append(player.el);
    box.append(frame);
    player.start();
    // Closing the window keeps the place, so the tile picks up from there.
    window.addEventListener('pagehide', () => player.destroy());
  }
}
