// Development fallback for entry paths that were not opened from a venue QR.
// Production venue entry still uses the scanned `/v/[venueSlug]` route. Removing
// this fallback before launch is tracked separately on the project board.
export const DEV_DEFAULT_VENUE_SLUG = "paris-test";
