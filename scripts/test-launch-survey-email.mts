// #559: the next-day survey email and the survey input contract. Renders the
// exact HTML the worker sends, in every locale; `SURVEY_EMAIL_OUT=<dir>` also
// writes each rendering for captures.
import './email-render-hooks.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
const { renderNextDaySurveyEmail } = await import('../emails/NextDaySurveyEmail.tsx');
// @ts-expect-error -- idem.
const { parseSurveyFragment, parseSurveyInput } = await import('../lib/launch-survey.ts');
// @ts-expect-error -- idem.
const { surveyStrings } = await import('../lib/survey-strings.ts');

const out = process.env.SURVEY_EMAIL_OUT;
if (out) mkdirSync(out, { recursive: true });
const url = `https://example.com/survey#00000000-0000-4000-8000-000000000559.${'ab'.repeat(32)}`;
const context = {
  reservation_id: '00000000-0000-4000-8000-000000000558', night_id: '00000000-0000-4000-8000-000000000010', recipient: 'guest@example.com',
  origin: 'https://example.com', version: 'a'.repeat(64), payload_envelope: null, venue_name: 'Le Comptoir', city: 'Paris',
  address: '12 rue Oberkampf', timezone: 'Europe/Paris', starts_at: '2026-12-10T19:00:00.000Z', ends_at: '2026-12-11T00:00:00.000Z',
  cancellation_deadline: '2026-12-08T19:00:00.000Z', before_deadline: false, state: 'confirmed' as const, cancellation_refundable: null, event_reason: null,
  amount_minor: 1000, currency: 'eur' as const, refund_state: 'succeeded' as const, refund_eligible: true, qr_eligible: false, kind: 'next_day_survey' as const,
};
const subjects = {
  en: 'Thank you for coming to Amourette on Thursday, December 10',
  fr: 'Merci pour votre présence à la soirée Amourette du jeudi 10 décembre',
  es: 'Gracias por venir a la noche Amourette del jueves, 10 de diciembre',
} as const;
for (const locale of ['en', 'fr', 'es'] as const) {
  const s = surveyStrings[locale];
  const mail = await renderNextDaySurveyEmail({ ...context, locale }, url);
  assert.equal(mail.subject, subjects[locale], `${locale} subject thanks the guest for that evening`);
  for (const fact of [url, 'Le Comptoir', s.action, s.private, s.once]) assert.ok(mail.html.includes(fact), `${locale} shows ${fact}`);
  // A service message: no promotion, no next-night pitch, no reservation link or QR.
  for (const absent of [s.nextNight, '/reservations/', 'cid:reservation-qr', 'unsubscribe', 'désinscri', 'baja']) assert.ok(!mail.html.includes(absent), `${locale} has no ${absent}`);
  assert.doesNotMatch(mail.html, /—/, `${locale} has no em dash`);
  if (out) writeFileSync(`${out}/survey-email-${locale}.html`, mail.html);
}

// Input contract shared by the page, the route and submit_launch_survey.
const link = '00000000-0000-4000-8000-000000000559', token = 'ab'.repeat(32);
assert.deepEqual(parseSurveyFragment(`#${link}.${token}`), { link, token });
for (const bad of ['', `#${link}`, `#${link}.${token}.x`, `#not-a-uuid.${token}`, `#${link}.${'AB'.repeat(32)}`, `#${link}.${'ab'.repeat(31)}`])
  assert.equal(parseSurveyFragment(bad), null, `refuses ${bad}`);
const answers = { matched: 'yes', talked: null, at_ease: 'somewhat', heard: 'instagram' };
assert.deepEqual(parseSurveyInput({ link, token, answers, next_night: false }), { link, token, answers, next_night: false });
assert.deepEqual(parseSurveyInput({ link, token, answers: {}, next_night: true }).answers, { matched: null, talked: null, at_ease: null, heard: null });
for (const [label, value] of [
  ['an empty survey without the box', { link, token, answers: {}, next_night: false }],
  ['an unknown answer', { link, token, answers: { ...answers, matched: 'maybe' }, next_night: false }],
  ['an unknown question', { link, token, answers: { ...answers, gender: 'woman' }, next_night: false }],
  ['a non-boolean opt-in', { link, token, answers, next_night: 'yes' }],
  ['a bad token', { link, token: 'x', answers, next_night: false }],
  ['a bad link', { link: 'x', token, answers, next_night: false }],
] as const) assert.throws(() => parseSurveyInput(value), /invalid_survey/, `refuses ${label}`);
console.log('PASS next-day survey email in en/fr/es (thanks, link, no promotion) and survey input contract');
