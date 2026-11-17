// The phone remote: the laptop and the phone talk directly to each other (WebRTC). Free public
// Nostr relays only introduce them, and that introduction is encrypted with a password that
// only exists in the pairing link. The library is loaded the first time the remote is used.

const HOST_KEY = 'multigrid.remotehost.v1';
const PAIR_KEY = 'multigrid.remotepair.v1';
export const REMOTE_PREFIX = '#remote=';
const APP_ID = 'multigrid-remote.thisiseames.github.io';

let lib = null;
export const loadRemoteLib = () => (lib ??= import('../vendor/remote-lib.js'));

const randomText = (bytes) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const read = (key) => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && /^[\w-]{12,64}$/.test(value.room) && /^[\w-]{16,64}$/.test(value.password) ? value : null;
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

/** This device's pairing as the screen being controlled, made the first time it's asked for. */
export function hostPairing(create = false) {
  const known = read(HOST_KEY);
  if (known || !create) return known;
  const made = { room: randomText(12), password: randomText(24) };
  write(HOST_KEY, made);
  return made;
}
export const forgetHost = () => write(HOST_KEY, null);

/** This device's pairing as a remote. */
export const controllerPairing = () => read(PAIR_KEY);
export const saveController = (pairing) => write(PAIR_KEY, pairing);
export const forgetController = () => write(PAIR_KEY, null);

export const pairLink = (pairing) => `${location.origin}${location.pathname}${REMOTE_PREFIX}${pairing.room}.${pairing.password}`;

/** A pairing from a link or its #remote= part, or null. */
export function pairingFromText(text) {
  const match = String(text || '').match(/#remote=([\w-]{12,64})\.([\w-]{16,64})/);
  return match ? { room: match[1], password: match[2] } : null;
}

/**
 * Joins the pairing's room. Each side sends one kind of message: the laptop sends 'state',
 * the phone sends 'cmd'. onPeers is told how many of the other side are there.
 */
export async function connect(pairing, { onState, onCommand, onPeers }) {
  const { joinRoom } = await loadRemoteLib();
  const room = joinRoom({ appId: APP_ID, password: pairing.password }, pairing.room);
  const state = room.makeAction('state');
  const command = room.makeAction('cmd');
  if (onState) state.onMessage((data) => onState(data));
  if (onCommand) command.onMessage((data) => onCommand(data));
  let peers = 0;
  room.onPeerJoin(() => { peers += 1; onPeers?.(peers, 'join'); });
  room.onPeerLeave(() => { peers = Math.max(0, peers - 1); onPeers?.(peers, 'leave'); });
  return {
    sendState: (data) => (peers ? state.send(data).catch(() => {}) : Promise.resolve()),
    sendCommand: (data) => (peers ? command.send(data).catch(() => {}) : Promise.resolve()),
    peers: () => peers,
    leave: () => room.leave().catch(() => {}),
  };
}

/** The QR code for a link, as SVG markup made by the bundled generator from our own text. */
export async function qrSvg(text) {
  const { qrcode } = await loadRemoteLib();
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  return code.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
}
