const genders = ["woman", "man", "nonbinary"];

// After the consent cutover, absent answers mean matching is unavailable.
// The database enforces active consent before storing a non-null pair.
export function hasMatchingPreferences(profile) {
  return Boolean(profile && genders.includes(profile.gender) &&
    Array.isArray(profile.interested_in) && profile.interested_in.length >= 1 &&
    profile.interested_in.length <= genders.length &&
    new Set(profile.interested_in).size === profile.interested_in.length &&
    profile.interested_in.every(value => genders.includes(value)));
}

export function requireTesterMatchingPreferences(profile) {
  if (!hasMatchingPreferences(profile)) {
    throw new Error("Tester matching is unavailable. Open the tester's profile, enter fresh preferences and explicitly agree to matching before retrying. No QA data has been changed.");
  }
}

export function matchingPreferencesCompatible(tester, candidate) {
  return hasMatchingPreferences(tester) && hasMatchingPreferences(candidate) &&
    tester.interested_in.includes(candidate.gender) && candidate.interested_in.includes(tester.gender);
}
