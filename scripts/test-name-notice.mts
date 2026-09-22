import assert from 'node:assert/strict';
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { nameNoticeKey, parseNameNotice, pruneNameNotices, shouldShowNameNotice } from '../lib/name-notice.ts';
const id=crypto.randomUUID(),second=crypto.randomUUID();
assert.equal(shouldShowNameNotice(id,null,null),true);
assert.equal(shouldShowNameNotice(id,id,null),false);
assert.equal(shouldShowNameNotice(id,null,id),false,'local receipt covers failed network acknowledgement');
assert.equal(shouldShowNameNotice(second,id,id),true);
assert.equal(shouldShowNameNotice(null,null,null),false);
for(const raw of [null,'{}','null','[]','broken',JSON.stringify({correctionId:'not-uuid',expiresAt:2000}),JSON.stringify({correctionId:id,expiresAt:'2000'}),JSON.stringify({correctionId:id,expiresAt:1000}),' '.repeat(161)]) assert.equal(parseNameNotice(raw,1000),null);
assert.deepEqual(parseNameNotice(JSON.stringify({correctionId:id,expiresAt:2000}),1000),{correctionId:id,expiresAt:2000});
const values=new Map([[nameNoticeKey(id,id),JSON.stringify({correctionId:id,expiresAt:1000})],[nameNoticeKey(id,second),JSON.stringify({correctionId:second,expiresAt:3000})],['other','preserved']]);
const storage: Storage={get length(){return values.size;},getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},removeItem:key=>{values.delete(key);},key:index=>[...values.keys()][index]??null,clear:()=>values.clear()};
pruneNameNotices(storage,2000);
assert.equal(values.size,2);assert.equal(values.get('other'),'preserved');
console.log('Name notice deduplication, untrusted local markers and expiry passed.');
