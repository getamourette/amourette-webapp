import assert from 'node:assert/strict';
import sharp from 'sharp';
// @ts-expect-error -- Node source entry.
import { validatePhotoContent, normalizePhotoContent } from '../lib/server/photo-validation.ts';
for (const [format, type] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']] as const) {
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).toFormat(format).toBuffer();
  await validatePhotoContent(new File([new Uint8Array(bytes)], 'arbitrary.svg', {type}));
  await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes.subarray(0,16))],'truncated',{type})));
  await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes)],'wrong-type',{type:type==='image/png'?'image/jpeg':'image/png'})));
}
for(const bytes of [new Uint8Array(),new Uint8Array(2*1024*1024+1),new TextEncoder().encode('<svg/>')]) await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes)],'fake.png',{type:'image/png'})));
console.log('Genuine image decoding, MIME mismatch, truncation and byte limits passed.');

for (const width of [1600, 1601]) {
  const bytes = await sharp({create:{width,height:1,channels:3,background:'red'}}).png().toBuffer();
  const file = new File([new Uint8Array(bytes)], 'photo.png', {type:'image/png'});
  if (width === 1600) await validatePhotoContent(file);
  else await assert.rejects(() => validatePhotoContent(file));
}
// @ts-expect-error -- Node source entry.
const { inspectPhoto, checkPhotoDimensions } = await import('../lib/photo-limits.ts');
for (const format of ['jpeg', 'png', 'webp'] as const) {
  for (const lossless of [false, true]) {
    const bytes = await sharp({create:{width:120,height:80,channels:3,background:'red'}}).toFormat(format, {lossless}).toBuffer();
    assert.deepEqual(inspectPhoto(bytes, `image/${format}`), {width:120,height:80});
    assert.throws(() => inspectPhoto(bytes.subarray(0, 16), `image/${format}`));
  }
}
checkPhotoDimensions(10000, 5000);
checkPhotoDimensions(12000, 1);
for (const [width, height] of [[10000, 5001], [12001, 1], [0, 1], [1, 0]]) assert.throws(() => checkPhotoDimensions(width, height));
console.log('Source headers, pixel/side boundaries and server output dimensions passed.');

const transparent = await sharp({create:{width:120,height:80,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
const normalized = await normalizePhotoContent(new File([new Uint8Array(transparent)], 'photo.png', {type:'image/png'}));
assert.ok(normalized.length <= 2 * 1024 * 1024);
const normalizedMetadata = await sharp(normalized).metadata();
assert.equal(normalizedMetadata.format, 'jpeg');
assert.equal(normalizedMetadata.exif, undefined);
assert.ok((await sharp(normalized).stats()).channels.every(channel => channel.mean >= 254));
const oriented = await sharp({create:{width:120,height:80,channels:3,background:'red'}}).withMetadata({orientation:6}).jpeg().toBuffer();
const rotated = await normalizePhotoContent(new File([new Uint8Array(oriented)], 'private-name.jpg', {type:'image/jpeg'}));
const rotatedMetadata = await sharp(rotated).metadata();
assert.equal(rotatedMetadata.width, 80);
assert.equal(rotatedMetadata.height, 120);
assert.equal(rotatedMetadata.exif, undefined);
console.log('Authoritative JPEG normalization, orientation and metadata stripping passed.');
