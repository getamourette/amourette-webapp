import assert from 'node:assert/strict';
// @ts-expect-error -- Node's type-stripping runner resolves explicit extensions.
import { BOUNDARY_WHITESPACE, isValidText, isValidEmail, normalizeEmail, isUuid, isVenueSlug, createVenueSlug, isLaunchThreshold, isUnsubscribeToken } from '../lib/input-validation.ts';
// @ts-expect-error -- Node source entry.
import { isInterestedIn } from '../lib/profile.ts';
// @ts-expect-error -- Node source entry.
import { parseStoredMessages } from '../lib/chat-delivery.ts';
// @ts-expect-error -- Node source entry.
import { isResendEvent, isIsoTimestamp } from '../lib/resend-webhook.ts';
// @ts-expect-error -- Node source entry.
import { readBoundedJson, RequestBodyError } from '../lib/server/request-body.ts';

for (const max of [30, 120, 500, 2000]) {
  for (const char of ['a', 'é', '中', '😀']) {
    for (const size of [1, max - 1, max]) assert.ok(isValidText(`\t${char.repeat(size)}\u00a0`, max));
    assert.equal(isValidText(char.repeat(max + 1), max), false);
  }
  assert.equal(isValidText('', max), false);
  assert.equal(isValidText(null, max), false);
  assert.ok(isValidText('', max, false));
  assert.equal(isValidText(' '.repeat(16384) + 'x', max), false);
}
for (const char of BOUNDARY_WHITESPACE) {
  assert.equal(char.trim(), '');
  assert.equal(isValidText(char, 30), false);
  assert.ok(isValidText(`${char}O’Neil 李${char}`,30));
}
assert.ok(isValidText('e\u0301',2));
assert.equal(isValidText('e\u0301',1),false);
for (const bad of ['\0', '\ud800', '\udfff']) assert.equal(isValidText(bad,30),false);
for (const good of ['name+night@custom.example', "o'neil@foo-bar.example", 'a'.repeat(64)+'@example.com', 'A.B@EXAMPLE.COM']) assert.ok(isValidEmail(good),good);
for (const bad of [null, [], {}, 'abc@gmailabc', 'a..b@example.com', '.a@example.com', 'a.@example.com', 'a@-example.com','a@example-.com','a@x..com','a@x.123','a'.repeat(65)+'@example.com','a@'+'b'.repeat(64)+'.com','élise@example.com','Kate@example.com','a b@example.com','a@x.com\0','a@x.com\nextra']) assert.equal(isValidEmail(bad),false,String(bad));
const full = 'a'.repeat(64)+'@'+'b'.repeat(63)+'.'+'c'.repeat(63)+'.'+'d'.repeat(61);
assert.equal(full.length,254); assert.ok(isValidEmail(full)); assert.equal(isValidEmail(full+'d'),false);
assert.equal(normalizeEmail('\tA.B+tag@EXAMPLE.COM\u00a0'),'a.b+tag@example.com');
for (const good of [['woman'],['man','woman'],['woman','man','nonbinary']]) assert.ok(isInterestedIn(good));
for (const bad of [null,[],['woman','woman'],[['woman']],['woman',null],['invalid']]) assert.equal(isInterestedIn(bad),false);
assert.ok(isVenueSlug('a'.repeat(80))); assert.equal(isVenueSlug('a'.repeat(81)),false);
for (const bad of [0,-1,1.5,Infinity,NaN,2147483648,'1',null]) assert.equal(isLaunchThreshold(bad),false);
assert.ok(isLaunchThreshold(2147483647));
const uuid='00000000-0000-0000-0000-000000000001';
assert.ok(isUuid(uuid)); assert.equal(isUuid(uuid+'x'),false);
assert.ok(isUnsubscribeToken('A'.repeat(43))); assert.equal(isUnsubscribeToken('A'.repeat(42)+'B'),false);
assert.equal(isUnsubscribeToken(' '+ 'A'.repeat(43)),false);
const row={id:uuid, match_id:uuid, sender_id:uuid, body:'😀', created_at:new Date().toISOString(), deliveryState:'failed'};
assert.equal(parseStoredMessages(JSON.stringify([row,row]),uuid,uuid).length,1);
for(const raw of ['null','{}','[null]',JSON.stringify([{...row,body:' '.repeat(2000)}]),JSON.stringify([{...row,sender_id:'other'}]),JSON.stringify([{...row,created_at:'bad'}])]) assert.deepEqual(parseStoredMessages(raw,uuid,uuid),[]);
const event={type:'email.future_event',created_at:'2026-09-09T12:00:00Z',data:{email_id:'id'}};
assert.ok(isResendEvent(event));
for(const bad of [null,[],{...event,created_at:'tomorrow'},{...event,data:{email_id:[]}}, {...event,data:{email_id:'id',to:'wrong'}}, {...event,data:{email_id:'id',bounce:{type:1}}}]) assert.equal(isResendEvent(bad),false);
assert.deepEqual(await readBoundedJson(new Request('http://localhost',{method:'POST',body:'{}'}),2),{});
assert.equal(await readBoundedJson(new Request('http://localhost',{method:'POST',body:'null'})),null);
for(const body of ['{','"😀"']) await assert.rejects(()=>readBoundedJson(new Request('http://localhost',{method:'POST',body}),2),RequestBodyError);
const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));c.close();}});
await assert.rejects(()=>readBoundedJson(new Request('http://localhost',{method:'POST',body:stream,duplex:'half'} as RequestInit),5),(error: unknown)=>error instanceof RequestBodyError && error.status===413);
console.log('Input boundaries, Unicode, email, restored data and streamed payload checks passed.');

for(const invalid of ['2026-02-30T12:00:00Z','2026-02-29T12:00:00Z','2026-09-11T24:00:00Z','2026-09-11T12:00:00+14:01','not a date']) assert.equal(isIsoTimestamp(invalid),false);
assert.ok(isIsoTimestamp('2024-02-29T12:00:00.123456+02:00'));

assert.equal(createVenueSlug("Café du soir"),"cafe-du-soir");
for(const name of ["中".repeat(120),"a".repeat(120)]) assert.ok(isVenueSlug(createVenueSlug(name)));

// The storage envelope also accommodates worst-case JSON escaping at the message cap.
const pending = Array.from({length:100},(_,i)=>({...row,id:`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,body:'a'+'\t'.repeat(1998)+'b'}));
assert.equal(parseStoredMessages(JSON.stringify(pending),uuid,uuid).length,100);
assert.deepEqual(parseStoredMessages(JSON.stringify([...pending,{...row,id:'00000000-0000-0000-0000-000000000101'}]),uuid,uuid),[]);
