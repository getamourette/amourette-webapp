import assert from 'node:assert/strict';
// @ts-expect-error -- Node source entry.
import { uploadPhotoFiles, type PhotoFile } from '../lib/server/photo-files.ts';

const files: PhotoFile[] = ['portrait','source','round'].map(bucket => ({bucket,path:`owner/${bucket}`,bytes:new Uint8Array([1,2,3]),type:'image/png'}));
for (const failure of ['none','returned','thrown'] as const) {
  const started: string[] = [], removed: string[] = [];
  const pending = new Map<string,{resolve:(value:{error:unknown})=>void;reject:(error:Error)=>void}>();
  const storage = {from(bucket: string) {return {
    upload(path: string, bytes: Uint8Array, options: {contentType:string;upsert:boolean;cacheControl:string}) {
      started.push(bucket);
      assert.equal(path, `owner/${bucket}`); assert.equal(bytes, files.find(file=>file.bucket===bucket)!.bytes);
      assert.deepEqual(options,{contentType:'image/png',upsert:false,cacheControl:'0'});
      return new Promise<{error:unknown}>((resolve,reject)=>pending.set(bucket,{resolve,reject}));
    },
    async remove(paths: string[]) { removed.push(...paths); if(bucket==='source') throw new Error('cleanup unavailable'); },
  };}};
  let settled = false;
  const result = uploadPhotoFiles(storage,files).then(value=>{settled=true;return value;});
  assert.deepEqual(started,['portrait','source','round']);
  if(failure==='thrown') pending.get('portrait')!.reject(new Error('response lost'));
  else pending.get('portrait')!.resolve({error:failure==='returned'?new Error('upload refused'):null});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(settled,false); assert.deepEqual(removed,[]);
  pending.get('round')!.resolve({error:null}); pending.get('source')!.resolve({error:null});
  assert.equal(await result,failure==='none');
  assert.deepEqual(removed,failure==='none'?[]:files.map(file=>file.path));
}
console.log('Concurrent photo uploads, unchanged bytes, wait-all rollback and cleanup failures passed.');
