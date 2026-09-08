# Verification record — 7 September 2026

- npm run check: PASS. TypeScript in admin/mobile/shared; 27 + 60 + 20 Vitest tests; 4 release-policy tests; ESLint with zero warnings.
- npm run build --workspace @rummal/admin: PASS (Next.js production build).
- npm run build:web --workspace @rummal/mobile -- --output-dir dist-launch: PASS (Expo web, development/demo configuration).
- Browser demo: filter narrowing/reset, inbox search, language switch, light/device appearance, local message Sent and checked-state accessibility verified. 390px viewport had no horizontal page overflow. No console errors in the exercised flow. Native accessibility/performance unverified.
- npm run db:test: BLOCKED. Config parses after inbucket correction; local database connection refused, no available Docker runtime.
- Hosted inspection: READ ONLY. Seven public and four private RLS tables; later albums/meetups/groups absent; empty tracked migration history.
- Dependency audit: two high findings cleared by removing unused ngrok; 15 moderate findings remain for review.
- npm run release:preflight: correctly BLOCKED on missing production environment, six evidence gates. Configured native icon files now exist. Not a passing release check.
- Report: output/pdf/Hittumst-research-and-launch-plan.pdf, eleven pages. All pages rendered and visually inspected; readable text/citations and no clipping or orphan continuation page.

No hosted write, new signed native build, store submission or advertising campaign occurred.

- Native assets: opaque 1024px iOS icon, 1024px adaptive/themed Android icons, 96px notification icon and 64px web favicon generated from the existing vector. Expo public configuration resolves them; actual native rendering is unverified.
