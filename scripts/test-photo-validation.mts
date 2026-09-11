import assert from 'node:assert/strict';
import sharp from 'sharp';
// @ts-expect-error -- Node source entry.
import { validatePhotoContent } from '../lib/server/photo-validation.ts';
for (const [format, type] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']] as const) {
  const bytes=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).toFormat(format).toBuffer();
  await validatePhotoContent(new File([new Uint8Array(bytes)], 'arbitrary.svg', {type}));
  await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes.subarray(0,16))],'truncated',{type})));
  await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes)],'wrong-type',{type:type==='image/png'?'image/jpeg':'image/png'})));
}
for(const bytes of [new Uint8Array(),new Uint8Array(5*1024*1024+1),new TextEncoder().encode('<svg/>')]) await assert.rejects(()=>validatePhotoContent(new File([new Uint8Array(bytes)],'fake.png',{type:'image/png'})));
console.log('Genuine image decoding, MIME mismatch, truncation and byte limits passed.');
