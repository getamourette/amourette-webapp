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

console.log("admin password recovery regressions: all assertions passed");
