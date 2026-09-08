# Security

Do not open a public issue containing user data, coordinates, messages, access tokens, moderation
evidence, or a reproducible exploit against a live system. Contact the project security owner through
the private address published in the production app and website.

The repository must never contain Supabase secret/service-role keys, OAuth client secrets, signing
keys, production database credentials, or real profile data. Rotate any credential immediately if it
is accidentally committed, even if the commit is later removed.

Production launch requires a named security and child-safety contact, an incident response process,
dependency monitoring, database advisor review, and verified backups.
