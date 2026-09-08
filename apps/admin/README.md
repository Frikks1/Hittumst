# Hittumst moderation console

The internal moderation workspace for report triage, profile-photo review, enforcement, and audit history.

## Run locally

```bash
npm install
npm run dev -- --port 3001
```

With no Supabase variables the console starts in a read-only-friendly demo environment. Copy `.env.example` to `.env.local` to connect a project. Both Supabase variables must be supplied together; malformed or partial configuration is rejected at runtime.

Real users must have one of `moderator`, `admin`, or `super_admin` in protected Supabase `app_metadata.role` or `app_metadata.roles`. The console never uses or accepts a service-role key. Database RLS remains the final authorization boundary.

## Database contract

The connected project should expose the `admin_dashboard_stats`, `admin_report_queue`, `admin_report_detail`, `admin_photo_queue`, and `admin_audit_timeline` RPCs to authorized staff. Mutations use `apply_moderation_action` and `review_profile_photo`. Demo mode mirrors those interfaces.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
