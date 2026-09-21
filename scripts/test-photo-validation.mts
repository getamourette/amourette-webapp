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

// @ts-expect-error -- Node source entry.
const { preparePhoto } = await import('../lib/server/prepare-photo.ts');
// @ts-expect-error -- Node source entry.
const { parsePhotoManifest, signPhotoTicket, verifyPhotoTicket } = await import('../lib/server/photo-ticket.ts');
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const now = Date.now();
const manifest = parsePhotoManifest({ type: 'image/jpeg', size: 5242880, revision: 0 });
const ticket = signPhotoTicket({ ...manifest, owner, path: `${owner}/${other}.jpg`, expires: now + 600_000 }, 'test-secret');
assert.equal(verifyPhotoTicket(ticket, owner, 'test-secret', now).size, 5242880);
for (const [token, user, key, time] of [[ticket, other, 'test-secret', now], [ticket, owner, 'wrong-secret', now], [ticket, owner, 'test-secret', now + 600_000], [ticket + 'x', owner, 'test-secret', now]] as const) {
  assert.throws(() => verifyPhotoTicket(token, user, key, time));
}
for (const invalid of [{ ...manifest, size: 5242881 }, { ...manifest, size: 0 }, { ...manifest, revision: -1 }, { ...manifest, type: 'image/svg+xml' }, { ...manifest, crop: { x: 99, y: 0, width: 50, height: 100 } }, { ...manifest, crop: { x: 0, y: 0, width: 0, height: 100 } }, { ...manifest, profile: { first_name: 'Alice' } }]) assert.throws(() => parsePhotoManifest(invalid));

// Uncropped files retain exact decoded pixels, dimensions, transparency and
// orientation. Identifying metadata is removed without lossy re-encoding.
for (const [format, type] of [['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']] as const) {
  const source = await sharp({create:{width:70,height:40,channels:4,background:{r:90,g:30,b:120,alpha:0.7}}})
    .withMetadata({orientation:6}).withExifMerge({IFD0:{Artist:'private-metadata-marker'}})
    .toFormat(format, format === 'jpeg' ? {progressive:true} : {}).toBuffer();
  const result = await preparePhoto(new File([new Uint8Array(source)], 'photo', {type}));
  assert.equal(result.type, type);
  assert.equal(result.bytes.includes(Buffer.from('private-metadata-marker')), false);
  const before = await sharp(source).autoOrient().raw().toBuffer({resolveWithObject:true});
  const after = await sharp(result.bytes).autoOrient().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual(after, before);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.orientation, 6);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.iptc, undefined);
}
// Native crop resolution exceeds the former 1600px cap. PNG preserves every
// selected pixel, with no JPEG quality setting or resampling step.
const source = await sharp({create:{width:2800,height:1800,channels:3,background:'#789abc'}}).jpeg().toBuffer();
const result = await preparePhoto(new File([new Uint8Array(source)], 'photo.jpg', {type:'image/jpeg'}), {x:0,y:0,width:50,height:100});
assert.equal(result.type, 'image/png');
const metadata = await sharp(result.bytes).metadata();
assert.equal(metadata.width, 1400); assert.equal(metadata.height, 1800);
assert.deepEqual(await sharp(result.bytes).raw().toBuffer(), await sharp(source).extract({left:0,top:0,width:1400,height:1800}).raw().toBuffer());
const sixteen = await sharp({create:{width:40,height:30,channels:3,background:'#789abc'}}).toColourspace('rgb16').png().toBuffer();
const cropped16 = await preparePhoto(new File([new Uint8Array(sixteen)], 'photo.png', {type:'image/png'}), {x:0,y:0,width:50,height:100});
assert.equal((await sharp(cropped16.bytes).metadata()).depth, 'ushort');
assert.deepEqual(await sharp(cropped16.bytes).toColourspace('rgb16').raw({depth:'ushort'}).toBuffer(), await sharp(sixteen).extract({left:0,top:0,width:20,height:30}).toColourspace('rgb16').raw({depth:'ushort'}).toBuffer());
console.log('Signed ticket ownership, expiry, tampering and source bounds; lossless metadata removal and native 8/16-bit cropping passed.');

// Wide-gamut photos keep their embedded colour profile and native samples.
const wide = await sharp({create:{width:40,height:30,channels:3,background:'#ec2478'}}).withIccProfile('p3').png().toBuffer();
const wideCrop = await preparePhoto(new File([new Uint8Array(wide)], 'wide.png', {type:'image/png'}), {x:0,y:0,width:50,height:100});
assert.deepEqual((await sharp(wideCrop.bytes).metadata()).icc, (await sharp(wide).metadata()).icc);
assert.deepEqual(await sharp(wideCrop.bytes, {ignoreIcc:true}).raw().toBuffer(), await sharp(wide, {ignoreIcc:true}).extract({left:0,top:0,width:20,height:30}).raw().toBuffer());

// @ts-expect-error -- Node source entry.
const { photoCropPixels, centeredRoundCrop, squarePhotoCrop, isSquarePhotoCrop, samePhotoCrop } = await import('../lib/photo-upload.ts');
for (const [w,h] of [[390,845],[1201,2602],[25,13],[4000,4000]]) {
  const center = centeredRoundCrop(w,h);
  assert.ok(isSquarePhotoCrop(center,w,h));
  assert.ok(samePhotoCrop(center,{...center}));
  const edge = squarePhotoCrop({x:45,y:60,width:55,height:40},w,h);
  assert.ok(isSquarePhotoCrop(edge,w,h));
  assert.ok(edge.x+edge.width<=100 && edge.y+edge.height<=100);
}
const round = {x:0,y:25,width:100,height:50};
const roundManifest = parsePhotoManifest({...manifest,roundCrop:round});
assert.deepEqual(verifyPhotoTicket(signPhotoTicket({...roundManifest,owner,path:`${owner}/${other}.jpg`,expires:now+600000},'test-secret'),owner,'test-secret',now).roundCrop,round);
for (const invalid of [{...round,x:NaN},{...round,width:Infinity},{...round,y:-1},{...round,height:100},{...round,width:'100'}]) assert.throws(()=>parsePhotoManifest({...manifest,roundCrop:invalid}));
for (let orientation=1;orientation<=8;orientation++) {
  const original = await sharp({create:{width:93,height:61,channels:3,background:'#125f91'}})
    .composite([{input:await sharp({create:{width:24,height:19,channels:3,background:'#ffaacc'}}).png().toBuffer(),left:3,top:7}])
    .withMetadata({orientation}).jpeg().toBuffer();
  const file = new File([new Uint8Array(original)],'oriented.jpg',{type:'image/jpeg'});
  const crop = {x:17,y:10,width:60,height:70};
  const prepared = await preparePhoto(file,crop);
  const normalized = await sharp(original).autoOrient().png().toBuffer();
  const dimensions = await sharp(normalized).metadata();
  assert.deepEqual(await sharp(prepared.bytes).raw().toBuffer(),await sharp(normalized).extract(photoCropPixels(crop,dimensions.width!,dimensions.height!)).raw().toBuffer());
  assert.deepEqual(await sharp(prepared.source.bytes).autoOrient().raw().toBuffer(),await sharp(original).autoOrient().raw().toBuffer());
  // Repeated crops still originate from the complete source, never the output.
  const reopened = await preparePhoto(new File([new Uint8Array(prepared.source.bytes)],'source.jpg',{type:prepared.source.type}),crop);
  // EXIF removal also discards density; compare native samples, not PNG DPI chunks.
  assert.deepEqual(await sharp(reopened.bytes).raw().toBuffer({resolveWithObject:true}),await sharp(prepared.bytes).raw().toBuffer({resolveWithObject:true}));
}
await assert.rejects(()=>preparePhoto(new File([new Uint8Array(source)],'source.jpg',{type:'image/jpeg'}),{x:0,y:0,width:50,height:100},{x:0,y:0,width:100,height:100}),/invalid_photo/);
console.log('Round geometry, manifest binding, all EXIF orientations and repeatable source crops passed.');

// @ts-expect-error -- Node source entry.
const { fitPhotoCrop, PHOTO_ASPECT } = await import('../lib/photo-upload.ts');
for (const crop of [{x:0,y:0,width:100,height:100},{x:80,y:80,width:1,height:1},{x:30,y:10,width:20,height:60}]) {
  const fitted = fitPhotoCrop(crop,1200,800,PHOTO_ASPECT);
  assert.ok(Math.abs(fitted.width*1200/(fitted.height*800)-PHOTO_ASPECT)<1e-10);
  const zoom = (800*PHOTO_ASPECT)/(fitted.width*1200/100);
  assert.ok(zoom>=1-1e-10 && zoom<=3+1e-10);
  assert.ok(fitted.x>=0 && fitted.y>=0 && fitted.x+fitted.width<=100.000001 && fitted.y+fitted.height<=100.000001);
  assert.ok(samePhotoCrop(fitted,fitPhotoCrop(fitted,1200,800,PHOTO_ASPECT)));
}

const legacyLarge = await sharp({create:{width:2500,height:1000,channels:3,background:'#c1a050'}}).png({compressionLevel:0}).toBuffer();
const legacyFile = new File([new Uint8Array(legacyLarge)],'legacy.png',{type:'image/png'});
assert.ok(legacyFile.size>5*1024*1024);
await assert.rejects(()=>preparePhoto(legacyFile));
const legacyCrop = await preparePhoto(legacyFile,{x:0,y:0,width:50,height:100},undefined,true);
assert.equal(legacyCrop.source.width,2500);
assert.deepEqual(await sharp(legacyCrop.bytes).raw().toBuffer(),await sharp(legacyLarge).extract({left:0,top:0,width:1250,height:1000}).raw().toBuffer());
