import assert from "node:assert/strict";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { venueAddress, showsPlacesLeft, bookingDay, bookingHours } from "../lib/booking.ts";

// #606: an address that already names its city is printed once ("Paris, Paris" before).
assert.equal(venueAddress("50 rue Léon Frot, 75011 Paris", "Paris"), "50 rue Léon Frot, 75011 Paris");
assert.equal(venueAddress("50 rue Léon Frot 75011 paris", "Paris"), "50 rue Léon Frot 75011 paris");
assert.equal(venueAddress("12 rue de la Rencontre", "Paris"), "12 rue de la Rencontre, Paris");
// A city that only appears inside another word is not a match.
assert.equal(venueAddress("3 rue Parisot", "Paris"), "3 rue Parisot, Paris");
assert.equal(venueAddress("1 rue (A)", "(A)"), "1 rue (A)");
assert.equal(venueAddress(null, "Paris"), "Paris");
assert.equal(venueAddress("  ", null), "");
assert.equal(venueAddress("12 rue X", "  "), "12 rue X");

// #606: remaining places appear only when 5 or fewer are left, never at 0 (the waitlist speaks then).
assert.deepEqual([0, 1, 4, 5, 6, 20].map(showsPlacesLeft), [false, true, true, true, false, false]);

// The card prints the venue's day and hours, whatever the device zone.
assert.equal(bookingDay("2026-12-10T19:00:00Z", "Europe/Paris", "fr"), "Jeudi 10 décembre");
assert.equal(bookingDay("2026-12-10T19:00:00Z", "Europe/Paris", "en"), "Thursday, December 10");
assert.equal(bookingHours("2026-12-10T19:00:00Z", "2026-12-10T22:00:00Z", "Europe/Paris", "fr", "Europe/Paris"), "20:00 – 23:00");
console.log("PASS booking event card: address printed once, few places only, venue day and hours");
