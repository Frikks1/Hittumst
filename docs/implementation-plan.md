# Hittumst implementation and release plan

Updated 8 September 2026. Launch scope is the existing Icelandic/English adults-only app with profiles, nearby discovery, messaging, private images and short videos, Hittingar social/dating meetups, blocking, reporting and account controls. Target: 1,000 accounts and 100 simultaneous users. Preserve current application identifiers and visual identity.

Permanent groups, voice, explicit adult-event categories and person ratings remain outside this release. Hittingar has independent release controls.

## Current checkpoint

The private Frikks1/Hittumst repository is established and the initial Linux CI run passed. The app has paginated inbox/history, stable message retries and quotas, Hittingar occurrence rooms and confirmation deadlines, protected-access safeguards, staff MFA, a retryable deletion queue and bilingual public preparation pages. Clean installation and a synthetic upgrade under the hosted permission baseline pass 371 database assertions. Application checks include 128 tests and both website/mobile web builds.

These results are implementation evidence. They do not prove hosted operation, native releases, recovery or capacity. The authoritative workstream ledger is `docs/implementation-status.md`; production gates remain closed in `docs/launch-readiness.json`.

## Remaining sequence

1. Confirm the staging organization and current provider costs. Establish isolated staging, apply the reviewed migration sequence there and verify direct API, Storage and Realtime access.
2. Complete authenticated media reservations/finalization, quarantine, durable processing, file/duration validation, metadata removal, thumbnails, 720p video, Frankfurt image/full-video moderation and appeals. Verify AWS content-use opt-out before media processing.
3. Finish core private push delivery, native login callbacks, account export and actual deletion cleanup. Complete Hittingar map/list pagination, provider setup, Icelandic location benchmark, concurrency and full recurrence/notification workflows.
4. Confirm publisher, domain, monitored support, moderation coverage and retention decisions. Finalize public policies, DPIA, processor disclosures, staff procedures and redacted monitoring.
5. Implement and rehearse separate encrypted media backups, manifests, restore and post-backup deletion/revocation replay. Demonstrate the 24-hour data-loss and eight-hour recovery targets in staging.
6. Run the 1,000-account/200-occurrence staging workload with 100 simultaneous users for 30 minutes. Verify the stated latency/error targets and block release on any authorization failure.
7. Produce properly signed iOS/Android builds and test physical devices/tablets, accessibility, Icelandic labels, poor networks, permissions, media and background behavior. Finish store accounts, declarations, assets and reviewer access.
8. Pilot with 25 adults, then 100 for 14 days. Complete applicable store testing requirements, confirm support coverage and prepare original advertising assets and campaign eligibility before acquisition.

The approved planning allowance is approximately $130–150 monthly before overages, taxes, advertising, developer accounts and human operations. Provider usage alerts, map spending controls and AWS upload-volume estimates must be configured and verified before scaling.

Completion requires verified core services and Hittingar, signed store releases, working support/moderation, proven backups/capacity and an advertising package ready for approved use. Do not mark a gate passed using code or unit tests alone.
