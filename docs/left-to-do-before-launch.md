# Hittumst: remaining work before launch

Updated 4 November 2026. All money features remain removed.

Current verified position:
- The website production build passed 94 HTTP checks; the mobile web export passed. These are local builds, not deployed services or signed-device acceptance.
- Staging is active and empty, with 43 migrations applied and 19 source migrations pending. The attempted upgrade approval expired before any change.
- The old Render staging address returns HTTP 503. Its recorded service ID is inaccessible and the connected workspace lists no services.
- Google Play enrollment exists; owner verification is pending.
- The existing Expo account is signed in. Staging has database and website settings; maps and Firebase/FCM still need configuration. The native configuration now accepts a GOOGLE_SERVICES_JSON file variable for Android package is.rummal.app.
- Fridrikmg3@gmail.com is the available support address. Publisher name, address, domain and designated safety contact remain unresolved.
- The owner approved public upload. The free-app source is in draft PR #5 on codex/free-app-launch. Website, app and database CI run before merge; no deployment or store submission is implied by upload.

The app is free. There are no paid memberships, wallets, top-ups, member transfers, gifts of money, sponsorship pools, cash rewards, vouchers, withdrawals, paid queue priority or host entry fees. Payment-provider approval, financial reserves, RevenueCat and store subscription products are no longer launch requirements. Group membership, consent withdrawal and community participation remain normal nonfinancial features.

## Engineering

1. Review and test the current source, including the money-removal migration. Deploy one reviewed candidate to staging. The local source change does not update hosted services automatically.
2. Apply the new migration to staging, test it, then production through the normal migration process. It closes transaction RPCs, permanently disables billing/commerce configuration, makes every event free and gives all accounts identical free allowances: six albums, 30 photos/three videos per album, ten hosted occurrences and 15 joins per month. These are resource limits with no paid upgrade.
3. Rebuild the native app without the purchases SDK. Verify old wallet/membership links lead back to settings and obsolete transaction endpoints return 410.
4. Verify email, Google/Apple login options offered by the app, maps/place search, photo/full-video moderation, Android push and LiveKit voice with actual providers and installed builds.
5. Exercise signup, profiles, discovery, chats, groups, albums, Hittingar, Strax, showcases, community posts and memory walls with multiple adult test accounts. Test blocked users, private locations/media, reports, accessibility and Icelandic/English copy.
6. Prove export, account deletion and historical-provider erasure where any prior data exists. Retain historical financial records only under the approved retention/deletion policy; do not create new transactions.
7. Verify monitoring, alerts, capacity, database and uploaded-file backup restoration, deletion-aware disaster recovery and rollback. Money workers and their queues are excluded from release readiness.
8. Build and test the signed Play test bundle; then prepare the separate production backend and final signed production bundle.

## Owner

1. Complete Google Play enrollment and verification; follow the testing requirements displayed for the account and recruit adult testers.
2. Finalize publisher name/address, domain, monitored support and safety contacts, primary and backup moderators, and the operating budget.
3. Establish the remaining service accounts and collaborator access: email, media moderation/backups, maps, voice, Firebase/Expo and required login providers. Existing accounts should be reused.
4. Approve privacy/terms, retention, sensitive-data handling and processor arrangements for the actual free app.
5. Run the required testing/pilot, supply real-device screenshots, policy/support/deletion URLs, store declarations and reviewer access.
6. Obtain store approval and make the release decision against the remaining 12 readiness gates.

## Retired scope

Earlier finance, billing, sponsorship and provider-acceptance documents describe retired work. They are historical references, not launch instructions. Historical SQL migrations remain unchanged so existing databases can upgrade safely. Internal legacy finance modules are not transaction entry points in this release.

Nothing here claims hosted deployment, successful device testing or store approval.
