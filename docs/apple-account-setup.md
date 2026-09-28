# Sign in with Apple and account deletion

The app retains an encrypted Apple refresh token so the deletion worker can revoke Apple authorization before removing Auth. Existing Apple members without a retained token may reauthorize. If that cannot be completed, confirmed account deletion still proceeds and the app shows Apple’s manual access-revocation instructions. An existing stored token is always revoked; provider failures or unreadable encrypted tokens keep the deletion queued for retry rather than claiming completion. See [the verification record](apple-account-verification.md).

## Owner setup

1. In Apple Developer → Certificates, Identifiers & Profiles, retain App ID is.rummal.app and enable Sign in with Apple.
2. Create/configure the website Services ID associated with that primary App ID. Register the deployed first-party domain and the exact return URL https://YOUR-DOMAIN/api/account/apple/callback. Replace YOUR-DOMAIN with the owned deployed domain; do not include wildcards.
3. Create a Sign in with Apple key. Save its one-time private .p8 download in the private credential store. Record the team ID, key ID and Services ID. Never commit or paste the key.
4. Configure the Supabase Apple provider's allowed audiences and client secret using Apple's supported settings. Keep native and web audiences consistent with the verified identity linkage. Test existing as well as new Apple identities.
5. Set server-only APPLE_NATIVE_CLIENT_ID=is.rummal.app, APPLE_SERVICE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY and APPLE_TOKEN_ENCRYPTION_KEY. The encryption key must be 64 hex characters generated securely. It is distinct from Apple's signing key.
6. Give the same token-vault key to the web and deletion worker in one environment; use different keys for staging and production. Back it up separately under restricted access. Replacing it without re-encrypting stored tokens breaks deletion, so rotation requires a reviewed migration/re-encryption procedure.
7. Verify native iPhone login, Android reauthorization for an existing Apple account, cancellation, another Apple identity rejection, expired/used OAuth state, provider failure/retry and actual authorization removal in Apple's account settings.

The server verifies Apple's issuer, signature, audience and subject against Supabase provider identities. User-editable metadata is not used as identity. OAuth state is bound to the initiating live session, single-use and ten-minute; tokens are never returned to mobile, logs or member exports. The callback returns only completion/failure to the fixed native destination or first-party account portal selected in the stored state.

The /account web portal supports email OTP sign-in, own-data/file export and explicit deletion confirmation. Apple reauthorization returns to this fixed first-party page when the stored state selects web mode; native flows return to rummal://privacy. The member must review and confirm deletion after returning. The hosted path still needs actual SMTP, Apple and browser verification. Verified-identity support remains available if the member has lost their email access.

References: [Apple account deletion requirements](https://developer.apple.com/support/offering-account-deletion-in-your-app/), [Apple REST token revocation](https://developer.apple.com/documentation/signinwithapplerestapi/revoke-tokens).
