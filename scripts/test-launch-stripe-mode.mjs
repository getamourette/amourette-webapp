// Stripe mode contract (#408): every place that used to refuse live mode now
// requires the configured mode, in both directions. No network, no database.
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { createLaunchStripe, launchStripeMode, verifySession, wrongStripeMode } from '../lib/server/launch-provider.ts';
import { applySession, handleLaunchEvent } from '../lib/server/launch-engine.ts';
import { recoverLaunchRefund } from '../lib/server/launch-recovery.ts';
import { receiveLaunchWebhook } from '../lib/server/launch-webhook.ts';
import { stripePaymentUrl } from '../app/admin/reservation-format.ts';

const saved = { ...process.env };
function configure(values) {
  for (const name of ['STRIPE_MODE', 'VERCEL_ENV', 'STRIPE_SECRET_KEY']) {
    if (values[name] === undefined) delete process.env[name]; else process.env[name] = values[name];
  }
}
let groups = 0;
async function check(name, fn) { await fn(); groups++; console.log(`PASS ${name}`); }

const id = '11111111-2222-4333-8444-555555555555';
const account = 'acct_mode';
const hold = new Date(Date.now() + 30 * 60 * 1000).toISOString();
const attempt = { id, amount_minor: 1000, currency: 'eur', hold_until: hold, checkout_id: null, account_id: account,
  starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
const metadata = { integration: 'amourette_launch_v1', reservation_id: id };
const session = (livemode, extra = {}) => ({ id: 'cs_mode', livemode, mode: 'payment', client_reference_id: id, metadata,
  amount_total: 1000, currency: 'eur', expires_at: Math.floor(Date.parse(hold) / 1000), payment_method_types: ['card'], ...extra });
const intent = (livemode, status = 'succeeded') => ({ id: 'pi_mode', livemode, status, amount_received: 1000, currency: 'eur', metadata });
function recorder() {
  const calls = [];
  return { calls, rpc: async name => { calls.push(name); return null; } };
}

try {
  await check('expected mode needs an explicit value that agrees with the deployment', () => {
    assert.equal(launchStripeMode({ STRIPE_MODE: 'test' }), 'test');
    assert.equal(launchStripeMode({ STRIPE_MODE: 'test', VERCEL_ENV: 'preview' }), 'test');
    assert.equal(launchStripeMode({ STRIPE_MODE: 'test', VERCEL_ENV: 'development' }), 'test');
    assert.equal(launchStripeMode({ STRIPE_MODE: 'live', VERCEL_ENV: 'production' }), 'live');
    for (const env of [{}, { VERCEL_ENV: 'production' }, { STRIPE_MODE: '' }, { STRIPE_MODE: 'LIVE', VERCEL_ENV: 'production' },
      { STRIPE_MODE: 'live ', VERCEL_ENV: 'production' }, { STRIPE_MODE: 'production', VERCEL_ENV: 'production' }]) {
      assert.throws(() => launchStripeMode(env), /stripe_mode_unconfigured/);
    }
    for (const env of [{ STRIPE_MODE: 'live' }, { STRIPE_MODE: 'live', VERCEL_ENV: 'preview' },
      { STRIPE_MODE: 'live', VERCEL_ENV: 'development' }, { STRIPE_MODE: 'live', VERCEL_ENV: 'Production' },
      { STRIPE_MODE: 'test', VERCEL_ENV: 'production' }]) {
      assert.throws(() => launchStripeMode(env), /stripe_mode_mismatch/);
    }
  });

  await check('without a configured mode every object and key is refused', async () => {
    configure({ STRIPE_SECRET_KEY: 'sk_test_x' });
    assert.throws(() => createLaunchStripe(), /stripe_mode_unconfigured/);
    for (const flag of [false, true]) {
      assert.throws(() => wrongStripeMode(flag), /stripe_mode_unconfigured/);
      assert.throws(() => verifySession(attempt, session(flag)), /stripe_mode_unconfigured/);
      const { calls, rpc: call } = recorder();
      await assert.rejects(handleLaunchEvent(call, {}, account, { livemode: flag, type: 'charge.updated', data: { object: {} } }), /stripe_mode_unconfigured/);
      assert.deepEqual(calls, []);
    }
    configure({ STRIPE_MODE: 'live', VERCEL_ENV: 'preview', STRIPE_SECRET_KEY: 'sk_live_x' });
    assert.throws(() => createLaunchStripe(), /stripe_mode_mismatch/);
    configure({ STRIPE_MODE: 'test', VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_x' });
    assert.throws(() => createLaunchStripe(), /stripe_mode_mismatch/);
  });

  for (const [mode, environment] of [['test', 'preview'], ['test', undefined], ['live', 'production']]) {
    const other = mode === 'live' ? 'test' : 'live';
    const right = mode === 'live', wrong = !right;
    const label = `${mode} expected (${environment ?? 'local'}), ${other} refused`;

    await check(`${label}: secret key prefix`, () => {
      configure({ STRIPE_MODE: mode, VERCEL_ENV: environment, STRIPE_SECRET_KEY: `sk_${mode}_x` });
      assert.ok(createLaunchStripe());
      for (const key of [`sk_${other}_x`, `rk_${mode}_x`, `pk_${mode}_x`, '', undefined, ` sk_${mode}_x`]) {
        configure({ STRIPE_MODE: mode, VERCEL_ENV: environment, STRIPE_SECRET_KEY: key });
        assert.throws(() => createLaunchStripe(), /stripe_key_mode_mismatch/);
      }
    });
    configure({ STRIPE_MODE: mode, VERCEL_ENV: environment });

    await check(`${label}: Checkout session`, () => {
      verifySession(attempt, session(right));
      for (const flag of [wrong, undefined, null, String(right)]) {
        assert.throws(() => verifySession(attempt, session(flag)), /checkout_evidence_mismatch/);
      }
    });

    await check(`${label}: PaymentIntent of a paid session`, async () => {
      const paid = { status: 'complete', payment_status: 'paid', payment_intent: 'pi_mode' };
      let recorded = recorder();
      assert.equal(await applySession(recorded.rpc, { paymentIntents: { retrieve: async () => intent(right) } }, attempt, session(right, paid)), 'done');
      assert.deepEqual(recorded.calls, ['bind_launch_checkout', 'record_launch_payment']);
      for (const flag of [wrong, undefined]) {
        recorded = recorder();
        await assert.rejects(applySession(recorded.rpc, { paymentIntents: { retrieve: async () => intent(flag) } }, attempt, session(right, paid)), /payment_evidence_mismatch/);
        assert.ok(!recorded.calls.includes('record_launch_payment'));
      }
    });

    await check(`${label}: PaymentIntent of an expired session`, async () => {
      const expired = { status: 'expired', payment_status: 'unpaid', payment_intent: 'pi_mode' };
      let recorded = recorder();
      assert.equal(await applySession(recorded.rpc, { paymentIntents: { retrieve: async () => intent(right, 'canceled') } }, attempt, session(right, expired)), 'done');
      assert.deepEqual(recorded.calls, ['bind_launch_checkout', 'release_launch_hold']);
      for (const flag of [wrong, undefined]) {
        recorded = recorder();
        assert.equal(await applySession(recorded.rpc, { paymentIntents: { retrieve: async () => intent(flag, 'canceled') } }, attempt, session(right, expired)), 'pending');
        assert.ok(!recorded.calls.includes('release_launch_hold'));
      }
    });

    await check(`${label}: webhook event, direct and through the signed HTTP boundary`, async () => {
      const event = flag => ({ id: 'evt_mode', livemode: flag, type: 'checkout.session.completed', data: { object: { id: 'cs_mode', metadata } } });
      const provider = { checkout: { sessions: { retrieve: async () => session(right) } } };
      const answers = name => name === 'inspect_launch_checkout' ? attempt : null;
      let calls = [];
      const call = async name => { calls.push(name); return answers(name); };
      await handleLaunchEvent(call, provider, account, event(right));
      assert.deepEqual(calls, ['inspect_launch_checkout', 'bind_launch_checkout']);
      for (const flag of [wrong, undefined]) {
        calls = [];
        await assert.rejects(handleLaunchEvent(call, provider, account, event(flag)), /stripe_event_account_mismatch/);
        assert.deepEqual(calls, []);
      }
      const sdk = new Stripe('sk_test_local'), secret = 'whsec_local_mode';
      const deliver = async flag => {
        const payload = JSON.stringify(event(flag));
        const signature = sdk.webhooks.generateTestHeaderString({ payload, secret });
        const signed = { webhooks: sdk.webhooks, ...provider };
        return receiveLaunchWebhook(new Request('https://test/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }),
          signed, call, async () => account, secret);
      };
      calls = [];
      assert.equal((await deliver(right)).status, 200);
      assert.deepEqual(calls, ['inspect_launch_checkout', 'bind_launch_checkout']);
      calls = [];
      assert.equal((await deliver(wrong)).status, 503);
      assert.deepEqual(calls, []);
    });

    await check(`${label}: PaymentIntent of a founder refund recovery`, async () => {
      const evidence = { account_id: account, payment_id: 'pi_mode', amount_minor: 1000, currency: 'eur', refund: null };
      const refund = { id: 're_mode', payment_intent: 'pi_mode', amount: 1000, currency: 'eur', status: 'succeeded', metadata: {} };
      const charge = { id: 'ch_mode', disputed: false, amount: 1000, currency: 'eur', amount_refunded: 0 };
      const input = { reservation: id, operation: null, action: 'adopt', provider: refund.id, note: 'Verified' };
      let calls = [], listed = 0;
      const call = async name => { calls.push(name); return name === 'inspect_launch_refund_recovery' ? evidence : null; };
      const provider = flag => ({ paymentIntents: { retrieve: async () => ({ ...intent(flag), latest_charge: charge }) },
        refunds: { async *list() { listed++; yield refund; }, retrieve: async () => refund } });
      await recoverLaunchRefund(call, provider(right), account, 'founder', input);
      assert.deepEqual(calls, ['inspect_launch_refund_recovery', 'adopt_launch_refund']);
      for (const flag of [wrong, undefined]) {
        calls = []; listed = 0;
        await assert.rejects(recoverLaunchRefund(call, provider(flag), account, 'founder', input), /recovery_evidence_mismatch/);
        assert.deepEqual(calls, ['inspect_launch_refund_recovery']);
        assert.equal(listed, 0);
      }
    });
  }

  await check('founder Dashboard link follows the mode of the payment itself', () => {
    assert.equal(stripePaymentUrl('pi_1', 'cs_live_a1'), 'https://dashboard.stripe.com/payments/pi_1');
    assert.equal(stripePaymentUrl('pi_1', 'cs_test_a1'), 'https://dashboard.stripe.com/test/payments/pi_1');
    assert.equal(stripePaymentUrl('pi_1', null), 'https://dashboard.stripe.com/test/payments/pi_1');
    assert.equal(stripePaymentUrl('pi/1', 'cs_live_a1'), 'https://dashboard.stripe.com/payments/pi%2F1');
  });
  console.log(`\n${groups} Stripe mode groups passed`);
} finally {
  configure(saved);
}
