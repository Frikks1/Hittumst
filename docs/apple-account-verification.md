# Apple authorization and account portal verification

Updated 2026-09-21. Source implementation and local regression tests are present. Hosted Apple credentials, SMTP/private relay delivery, callback registration and physical-device acceptance remain release prerequisites; local tests are not provider acceptance evidence.

The hosted `/account` portal uses an isolated session-storage Supabase client, bounded network requests, member bearer APIs and exact browser-origin checks. It exports only the current account and its authorized media. Media downloads preserve a sanitized server attachment basename and allowed image/video extension, keep binary content as an attachment, and recheck account authorization after Storage I/O. The portal handles failed initial session checks and does not describe queued deletion as completed cleanup.

Apple custody obtains the account, Apple subject and session ID from an authenticated database function. Client-supplied account IDs, subjects and redirect URLs are rejected. Native one-use codes and web reauthorization both use Apple's fixed token endpoint and verify issuer, audience, signature and expected subject. Tokens are encrypted using AES-256-GCM with account/client binding before storage. Vault reads are service-only; readiness responses never expose tokens or ciphertext.

OAuth state uses 32 random bytes, stores only its SHA-256 hash, expires after ten minutes and is consumed once. The stored state fixes the native/web return choice. A callback cannot choose its own return URL, account or session. State is tied to an existing Auth session and is invalidated on logout, session expiry, account deletion and restore quarantine. Atomic custody rechecks the same session after the external token exchange. If retaining a newly exchanged token fails, the server attempts immediate Apple revocation and reports failure. The actual provider/network failure path still requires staging acceptance and operational monitoring.

Session/profile/flow locks follow account deletion and logout ordering. Calls begun before a deletion request cannot write fresh token custody afterward. Concurrent callback replay cannot consume a state twice. Native returns use the fixed `rummal://privacy` route; web returns use only the configured HTTPS origin's `/account`. Callback responses use no-store and no-referrer and never place credentials or state in the return URL.

Deletion remains possible when no Apple refresh/access token or authorization code is available, following Apple's TN3194 guidance. Native and hosted flows provide Apple's manual Sign in with Apple revocation instructions and offer optional reauthorization. The worker skips only the absence of a token; a stored token is always decrypted and revoked, including after its Apple identity was unlinked. Database, decryption and provider failures keep deletion pending for retry. Account deletion does not cancel App Store or Google Play subscription billing; both client flows retain cancellation guidance. RevenueCat erasure is documented separately in [billing launch work](billing-launch-work.md).

Configuration needs the native App ID, grouped Services ID, Apple team/key IDs, private signing key, independent 32-byte encryption key, registered HTTPS callback and matching Supabase Apple provider settings. The public website origin must be an HTTPS origin without credentials, paths, query, fragment or custom port. Register the SMTP sending domain with Apple's private email relay if members receive OTP mail at a relay address. The native deep link, hosted OTP, auth-session revocation, Apple cancellation/reauthorization and deletion must be exercised in staging.

Local evidence:

- `supabase/tests/database/apple_authorization.test.sql`: 20 assertions passed after the session-binding migration, including actual roles, account/session/subject binding, replay, expiry, pending deletion and logout. The final lock-order follow-up is covered by the subsequent full database run.
- `supabase/tests/database/apple_tokens.test.sql`: retains real service-role vault tests with the required synthetic session and authorized writer.
- Admin tests cover cryptographic envelope binding, Apple issuer/audience/subject checks, token revocation failures, native/web API custody, callback redirects/cancellation/body limits, lifecycle authorization, safe attachment names and no-token deletion fallback.
- Mobile tests and the route inventory are recorded in [feature verification](feature-verification.md). The root task owns final full-suite, generated-type and clean/upgrade database proof.

Official references:

- [Apple TN3194: deletion and token revocation, including missing-token fallback](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Apple token revocation endpoint](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens)
- [Apple web authorization response](https://developer.apple.com/documentation/signinwithapple/configuring-your-webpage-for-sign-in-with-apple)
- [Apple's manual access-revocation instructions](https://support.apple.com/102571)
