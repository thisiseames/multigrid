import test from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTubeLiveInput, readYouTubeLive, youtubeChannelIdOf } from '../src/youtube-live.js';

const livePage = `Title: Unc, Ocho & Iso react to Bills beat Chiefs - YouTube

URL Source: https://www.youtube.com/channel/UCKnodHJpZd8UbSvAufDd3_g/live

Markdown Content:
Back
Nightcap
Unc, Ocho & Iso react to Bills beat Chiefs + Eagles beat Cowboys + Bears beat Lions | Nightcap

Nightcap 74,000 watching now
`;

const offlinePage = `Title: MrBeast

URL Source: https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA/live

Markdown Content:
Back
Home
Videos
Live
`;

test('youtube live: a watching-now line means live, with its title and viewers', () => {
  const status = readYouTubeLive(livePage, 'Nightcap');
  assert.equal(status.live, true);
  assert.equal(status.name, 'Nightcap');
  assert.equal(status.title, 'Unc, Ocho & Iso react to Bills beat Chiefs');
  assert.equal(status.viewers, 74000);
});

test('youtube live: a short viewer number is read', () => {
  const page = `Title: Lofi radio\n\nLofi Girl 3.4K watching now\n`;
  assert.equal(readYouTubeLive(page).viewers, 3400);
  assert.equal(readYouTubeLive(page).live, true);
});

test('youtube live: an offline channel page is not live', () => {
  const status = readYouTubeLive(offlinePage, 'MrBeast');
  assert.equal(status.live, false);
  assert.equal(status.title, '');
  assert.equal(status.viewers, 0);
  assert.equal(status.name, 'MrBeast');
});

test('youtube live: a channel ID is read from channels, uploads feeds and live embeds', () => {
  const id = `UC${'a'.repeat(22)}`;
  assert.equal(youtubeChannelIdOf(id), id);
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/channel/${id}`), id);
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/channel/${id}/videos`), id);
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/playlist?list=UU${'a'.repeat(22)}`), id);
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/embed/live_stream?channel=${id}`), id);
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/@nightcap/live`), '');
  assert.equal(youtubeChannelIdOf(`https://www.youtube.com/watch?v=sheUMMvyqSY`), '');
});

test('youtube live: the Add box accepts a channel, an @handle, a video and a bare channel ID', () => {
  const id = `UC${'a'.repeat(22)}`;
  assert.equal(parseYouTubeLiveInput(`https://www.youtube.com/channel/${id}/live`).channelId, id);
  assert.equal(parseYouTubeLiveInput('https://www.youtube.com/@nightcap/live').handle, 'nightcap');
  assert.equal(parseYouTubeLiveInput('@nightcap').handle, 'nightcap');
  assert.equal(parseYouTubeLiveInput('nightcap').handle, 'nightcap');
  assert.equal(parseYouTubeLiveInput('https://www.youtube.com/watch?v=sheUMMvyqSY').videoId, 'sheUMMvyqSY');
  assert.equal(parseYouTubeLiveInput(id).channelId, id);
  assert.equal(parseYouTubeLiveInput('not a channel name!'), null);
});
