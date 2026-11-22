import test from 'node:test';
import assert from 'node:assert/strict';
import { expiresAt, tiktokAvatar, xAvatar } from '../src/avatars.js';

test("a TikTok profile page's picture is found, as a usable address", () => {
  const html = '"avatarThumbUrl":"https://p16-common-sign.tiktokcdn-us.com/tos-useast5-avt-0068-tx/115c~tplv-tiktokx-cropcenter:100:100.jpeg?dr=9640\\u0026x-expires=1795489200\\u0026x-signature=5Ek7%3D"';
  const url = tiktokAvatar(html);
  assert.equal(url, 'https://p16-common-sign.tiktokcdn-us.com/tos-useast5-avt-0068-tx/115c~tplv-tiktokx-cropcenter:100:100.jpeg?dr=9640&x-expires=1795489200&x-signature=5Ek7%3D');
  assert.equal(expiresAt(url), 1795489200000);
  const md = 'Image 1: https://p16-common-sign.tiktokcdn-us.com/tos-useast5-avt-0068-tx/abc~tplv-tiktokx-cropcenter:100:100.jpeg?x-expires=1795489200&x-signature=Q%3D)';
  assert.ok(tiktokAvatar(md).startsWith('https://p16-common-sign.tiktokcdn-us.com/'));
  assert.equal(tiktokAvatar('no picture here'), '');
});

test("an X profile's picture is found in its 400 × 400 size", () => {
  assert.equal(xAvatar('![Image](https://pbs.twimg.com/profile_images/1920502025000824833/S0ru3-qY_normal.jpg)'), 'https://pbs.twimg.com/profile_images/1920502025000824833/S0ru3-qY_400x400.jpg');
  assert.equal(xAvatar('https://pbs.twimg.com/profile_images/1/abc_400x400.png'), 'https://pbs.twimg.com/profile_images/1/abc_400x400.png');
  assert.equal(xAvatar('https://pbs.twimg.com/media/xyz.jpg'), '');
  assert.equal(expiresAt('https://pbs.twimg.com/profile_images/1/abc_400x400.png'), 0);
});
