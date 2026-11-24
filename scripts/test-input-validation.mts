import assert from 'node:assert/strict';
// @ts-expect-error -- Node's type-stripping runner resolves explicit extensions.
import { bioValidation, isBioLengthError, BOUNDARY_WHITESPACE, isValidText, isValidEmail, normalizeEmail, isUuid, isVenueSlug, createVenueSlug, isLaunchThreshold, isUnsubscribeToken } from '../lib/input-validation.ts';
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

// #472: the venue name is public, so a slug derived from it alone lets anyone reach the room.
// The slug keeps a readable stem but ends with 16 random base32 characters (80 bits).
const slug = createVenueSlug("Café du soir");
assert.match(slug,/^cafe-du-soir-[a-z2-7]{16}$/,`slug ${slug} must not be derivable from the venue name`);
assert.notEqual(createVenueSlug("Café du soir"),slug);
for(const name of ["中".repeat(120),"a".repeat(120),"!!!"]) { const long=createVenueSlug(name); assert.ok(isVenueSlug(long)); assert.match(long,/-[a-z2-7]{16}$/); }

// The storage envelope also accommodates worst-case JSON escaping at the message cap.
const pending = Array.from({length:100},(_,i)=>({...row,id:`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`,body:'a'+'\t'.repeat(1998)+'b'}));
assert.equal(parseStoredMessages(JSON.stringify(pending),uuid,uuid).length,100);
assert.deepEqual(parseStoredMessages(JSON.stringify([...pending,{...row,id:'00000000-0000-0000-0000-000000000101'}]),uuid,uuid),[]);

for (const value of [null, undefined, '', BOUNDARY_WHITESPACE]) assert.equal(bioValidation(value),null);
for (const char of ['a','é','😀']) for (const size of [299,300,301]) {
  assert.equal(bioValidation(BOUNDARY_WHITESPACE+char.repeat(size)+BOUNDARY_WHITESPACE),size>300?'too_long':null);
}
for (const value of [1,{},[], '\0', '\ud800',' '.repeat(16385)]) assert.equal(bioValidation(value),'invalid');
assert.ok(isBioLengthError(new Error('bio_too_long')));
assert.ok(isBioLengthError({code:'23514',message:'violates check constraint "profiles_bio_check"'}));
for (const error of [null,{},new Error('upload'),{code:'23514',message:'invalid profile input'},
  {code:'23514',message:'violates check constraint "profiles_first_name_check"'}]) assert.equal(isBioLengthError(error),false);

// #482: report outcomes and the people a guest may report from tonight.
{
  // @ts-expect-error -- Node source entry.
  const { reportOutcome, parseSeenTonight, mergeSeenTonight, rememberSeenTonight, readSeenTonight, seenTonightKey, SEEN_MAX_PEOPLE } = await import('../lib/report.ts');
  assert.equal(reportOutcome(null), 'sent');
  assert.equal(reportOutcome({ message: 'You already reported this person for this venue night.' }), 'already');
  assert.equal(reportOutcome({ message: 'a note is required for other reports' }), 'note_required');
  assert.equal(reportOutcome({ message: 'You can only report users you shared a venue night with.' }), 'not_eligible');
  assert.equal(reportOutcome({ message: 'TypeError: Failed to fetch' }), 'failed');
  const me = '00000000-0000-4000-8000-000000000001', night = '00000000-0000-4000-8000-0000000000aa';
  const person = (n: number, first_name: string | null = `P${n}`) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, first_name, photo_url: null });
  for (const raw of [null, '', '{', '{}', '"x"', 'null', JSON.stringify([{ id: 'nope', first_name: 'A', photo_url: null }]),
    JSON.stringify([{ ...person(2), first_name: 'x'.repeat(201) }]), JSON.stringify([{ ...person(2), photo_url: 3 }]), 'x'.repeat(64_001)])
    assert.deepEqual(parseSeenTonight(raw), []);
  assert.deepEqual(parseSeenTonight(JSON.stringify([person(2), person(2, 'dup'), { ...person(3), extra: true }])), [person(2), person(3)]);
  assert.equal(parseSeenTonight(JSON.stringify(Array.from({ length: 150 }, (_, i) => person(i + 2)))).length, SEEN_MAX_PEOPLE);
  // Latest first, own profile excluded, a renamed person keeps the latest name.
  assert.deepEqual(mergeSeenTonight([person(2), person(3)], [person(3, 'New'), { ...person(1) }], me), [person(3, 'New'), person(2)]);
  const store = new Map<string, string>();
  const storage = () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size; } });
  store.set(seenTonightKey(me, '00000000-0000-4000-8000-0000000000bb'), JSON.stringify([person(9)]));
  store.set('unrelated', '1');
  rememberSeenTonight(me, night, [person(2)], storage);
  assert.deepEqual([...store.keys()].sort(), [seenTonightKey(me, night), 'unrelated'].sort());
  assert.deepEqual(readSeenTonight(me, night, storage), [person(2)]);
  rememberSeenTonight('not-a-uuid', night, [person(4)], storage);
  assert.deepEqual(readSeenTonight(me, night, storage), [person(2)]);
  const broken = () => { throw new Error('SecurityError'); };
  assert.doesNotThrow(() => rememberSeenTonight(me, night, [person(4)], broken));
  assert.deepEqual(readSeenTonight(me, night, broken), []);
}
