import assert from "node:assert/strict";
import {
  createPasswordRecoveryEventGate,
  resolveAdminRecoveryGate,
} from "../lib/admin-password-recovery.ts";

function fakeAuth(events, initializationFails = false) {
  let callback;
  let active = true;

  return {
    onAuthStateChange(next) {
      callback = next;
      return {
        data: {
          subscription: {
            unsubscribe() {
              active = false;
            },
          },
        },
      };
    },
    async initialize() {
      for (const item of events) {
        setTimeout(() => {
          if (active) callback?.(item.event, item.session);
        }, 0);
      }
      if (initializationFails) throw new Error("expired recovery link");
    },
  };
}

const founderRecovery = { userId: "founder" };
const nonAdminRecovery = { userId: "participant" };

// An ordinary founder session never unlocks the reset route.
const ordinarySession = await createPasswordRecoveryEventGate(
  fakeAuth([
    { event: "INITIAL_SESSION", session: founderRecovery },
    { event: "SIGNED_IN", session: founderRecovery },
  ]),
);
assert.equal(ordinarySession, null);
assert.equal(
  await resolveAdminRecoveryGate(ordinarySession, async () => true),
  "invalid",
);

// The recovery event may follow INITIAL_SESSION during redirect initialization;
// it must still be captured rather than misclassified as an ordinary session.
const validRecovery = await createPasswordRecoveryEventGate(
  fakeAuth([
    { event: "INITIAL_SESSION", session: founderRecovery },
    { event: "PASSWORD_RECOVERY", session: founderRecovery },
  ]),
);
assert.deepEqual(validRecovery, founderRecovery);
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => true),
  "ready",
);

// Expired or malformed recovery URLs emit no valid recovery event.
const expiredRecovery = await createPasswordRecoveryEventGate(fakeAuth([], true));
assert.equal(expiredRecovery, null);
assert.equal(
  await resolveAdminRecoveryGate(expiredRecovery, async () => true),
  "invalid",
);

// A real recovery event for an account outside the founder allow-list is denied.
const unauthorizedRecovery = await createPasswordRecoveryEventGate(
  fakeAuth([
    { event: "PASSWORD_RECOVERY", session: nonAdminRecovery },
  ]),
);
assert.equal(
  await resolveAdminRecoveryGate(unauthorizedRecovery, async () => false),
  "unauthorized",
);

// #374: a founder with an authenticator enters its code before the founder
// check and the password form; the allow-list is not consulted until then.
let adminChecks = 0;
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => { adminChecks += 1; return true; }, async () => true),
  "challenge",
);
assert.equal(adminChecks, 0);
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => true, async () => false),
  "ready",
);
assert.equal(
  await resolveAdminRecoveryGate(null, async () => true, async () => true),
  "invalid",
);

// A founder without an authenticator is offered setup instead of being refused:
// founder access requires the second factor, so the password form would be
// unreachable. Anyone else is still refused, and setup is never asked first.
let setupChecks = 0;
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => false, async () => false, async () => true),
  "setup",
);
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => false, async () => false, async () => false),
  "unauthorized",
);
assert.equal(
  await resolveAdminRecoveryGate(validRecovery, async () => true, async () => false, async () => { setupChecks += 1; return true; }),
  "ready",
);
assert.equal(setupChecks, 0);

console.log("admin password recovery regressions: all assertions passed");
