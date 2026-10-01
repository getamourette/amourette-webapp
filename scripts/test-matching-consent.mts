import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// @ts-expect-error -- Node source entry.
import { MATCHING_CONSENT_WORDING, MATCHING_CONSENT_VERSION, validMatchingConsent, parseMatchingConsentState } from '../lib/matching-consent.ts';
// @ts-expect-error -- Node source entry.
import { parsePhotoProfile, signPhotoTicket, verifyPhotoTicket } from '../lib/server/photo-ticket.ts';
const profile = {first_name:'Alice',bio:null,gender:'woman',interested_in:['man'],adult_confirmed:true,
  matching_consent:true,matching_consent_version:MATCHING_CONSENT_VERSION,matching_consent_locale:'en'};
for(const patch of [{matching_consent:false},{matching_consent:null},{matching_consent:undefined},{matching_consent:'true'},
  {matching_consent:1},{matching_consent_version:'forged'},{matching_consent_version:' '+MATCHING_CONSENT_VERSION},
  {matching_consent_locale:'EN'},{matching_consent_locale:[]},{matching_consent_locale:null}]) {
  assert.equal(validMatchingConsent({...profile,...patch}),false);
  assert.throws(()=>parsePhotoProfile({...profile,...patch}));
}
const sql = readFileSync('supabase/migrations/20260930000010_matching_preference_consent.sql','utf8');
for(const [locale,wording] of Object.entries(MATCHING_CONSENT_WORDING)) {
  assert.equal(validMatchingConsent({...profile,matching_consent_locale:locale}),true);
  assert.ok(sql.includes(`('${MATCHING_CONSENT_VERSION}','${locale}','${wording.replaceAll("'","''")}')`),'proof preserves the displayed localized wording');
}
const owner='00000000-0000-4000-8000-000000000001',now=Date.now();
const signed=signPhotoTicket({type:'image/png',size:100,revision:0,owner,path:`${owner}/${owner}.png`,expires:now+600000,profile:parsePhotoProfile(profile)},'synthetic');
assert.deepEqual(verifyPhotoTicket(signed,owner,'synthetic',now).profile,profile,'ticket binds the same consent metadata through photo processing');
const state={active:true,revision:owner,granted_at:new Date().toISOString(),withdrawn_at:null,available_at:null,server_now:new Date().toISOString()};
assert.deepEqual(parseMatchingConsentState(state),state);
for(const value of [null,[],{}, {...state,active:'true'},{...state,revision:null},{...state,withdrawn_at:state.server_now},
  {...state,granted_at:null},{...state,server_now:1},{...state,available_at:'infinity'}]) assert.throws(()=>parseMatchingConsentState(value));
console.log('Consent HTTP inputs, exact localized proof, signed ticket binding and owner-state validation passed.');
