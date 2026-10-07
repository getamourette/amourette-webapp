# Email unsubscribe contract

This is the integration contract for the email delivery pipeline (#63).

For each deduplicated recipient, call the service-role-only RPC
`issue_email_unsubscribe_token(email)`. It returns a random base64url token that
is valid for 12 months. Build the link from the configured public origin:

`/unsubscribe?token=<base64url>&lang=<en|fr|es>`

Do not log the token or address with the link. The database retains only the
token's SHA-256 hash. A token is reusable, scoped only to global unsubscribe for
its normalized address, and cannot read or reveal that address.

Loading the link performs validation only. It never changes consent. The user
must explicitly confirm, which sends a POST. The response state is one of:

- `unsubscribed`: at least one active row for the address was suppressed;
- `already_unsubscribed`: no active row remained;
- `invalid_token`: the token is unknown, expired, or revoked;
- `failure`: the operation could not be completed.

POST is idempotent. A still-valid token remains authoritative after a later
owner-scoped re-subscription and will globally suppress that address again.
Neither validation nor mutation responses contain an email address or token.

The operational privacy channel is `privacy@getamourette.com`. Cloudflare Email
Routing forwards it to the founders through the separately managed
`amourette-email-forwarding` Worker. #299 prepares #141's contact integration in
email preferences and every unsubscribe state, using `lib/privacy.ts` as the
shared address source. The localized disclosure separates announcement
unsubscribe from requesting profile/personal-data deletion. Policy links retain
only the displayed `lang`, never the bearer token, and use `noreferrer` alongside
the unsubscribe page's existing no-referrer metadata. Reading either the policy
or contact information never confirms an unsubscribe. Deployment remains pending.
