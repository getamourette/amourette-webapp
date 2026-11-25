// #558: the reminder emails carry the night's practical details and the private
// management link, never the QR, and never promise a free cancellation once the
// deadline has passed. Renders the exact HTML the worker sends, in every locale.
// `REMINDER_EMAIL_OUT=<dir>` also writes each rendering to <dir> for captures.
import './email-render-hooks.mjs';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

// @ts-expect-error -- executed by node --experimental-strip-types, not bundled.
const { renderReservationLifecycleEmail } = await import('../emails/ReservationLifecycleEmail.tsx');

const out = process.env.REMINDER_EMAIL_OUT;
if (out) mkdirSync(out, { recursive: true });
const manage = 'https://example.com/reservations/access#reminder';
const base = {
  reservation_id: '00000000-0000-4000-8000-000000000558', night_id: '00000000-0000-4000-8000-000000000010', recipient: 'guest@example.com',
  origin: 'https://example.com', version: 'a'.repeat(64), payload_envelope: null, venue_name: 'Le Comptoir', city: 'Paris',
  address: '12 rue Oberkampf', timezone: 'Europe/Paris', starts_at: '2026-12-10T19:00:00.000Z', ends_at: '2026-12-11T00:00:00.000Z',
  cancellation_deadline: '2026-12-08T19:00:00.000Z', state: 'confirmed' as const, cancellation_refundable: null, event_reason: null,
  amount_minor: 1000, currency: 'eur' as const, refund_state: null, refund_eligible: false, qr_eligible: true,
};
const expected = {
  en: { two: /^Reminder: your Amourette evening on Thursday, December 10$/, morning: /^Tonight: your Amourette evening on Thursday, December 10$/, until: 'until', over: 'no longer possible for this evening' },
  fr: { two: /^Rappel : votre soirée Amourette du jeudi 10 décembre$/, morning: /^C’est ce soir : votre soirée Amourette du jeudi 10 décembre$/, until: 'jusqu’au', over: 'plus possible pour cette soirée' },
  es: { two: /^Recordatorio: tu noche Amourette del jueves, 10 de diciembre$/, morning: /^Es esta noche: tu noche Amourette del jueves, 10 de diciembre$/, until: 'hasta el', over: 'ya no es posible para esta noche' },
} as const;

for (const locale of ['en', 'fr', 'es'] as const) {
  for (const [kind, before] of [['reminder_two_days', true], ['reminder_morning', false]] as const) {
    const mail = await renderReservationLifecycleEmail({ ...base, locale, kind, before_deadline: before }, manage, '2026-12-11T23:00:00.000Z', false);
    const e = expected[locale], label = `${locale} ${kind}`;
    assert.match(mail.subject, kind === 'reminder_morning' ? e.morning : e.two, `${label} subject names the evening and its date`);
    for (const fact of ['12 rue Oberkampf', 'Le Comptoir', 'Paris', locale === 'en' ? '8:00' : '20:00', manage]) assert.ok(mail.html.includes(fact), `${label} shows ${fact}`);
    assert.doesNotMatch(mail.html, /cid:reservation-qr/, `${label} carries no QR`);
    // The deposit line states the refund on arrival; French says "caution".
    assert.match(mail.text, locale === 'fr' ? /Caution :\s*10,00\s€, remboursée quand notre équipe confirme votre présence/ : /10(\.|,)00/);
    if (before) assert.ok(mail.text.includes(e.until), `${label} states the free-cancellation deadline`);
    else {
      assert.ok(mail.text.includes(e.over), `${label} says free cancellation is over`);
      assert.ok(!mail.text.includes(e.until), `${label} never prints a passed deadline`);
    }
    assert.doesNotMatch(mail.html, /—/, `${label} has no em dash`);
    if (out) writeFileSync(`${out}/${kind}-${locale}.html`, mail.html);
  }
}
console.log('PASS reminder emails: date, time, address, deposit, management link, no QR, honest cancellation line in en/fr/es');
