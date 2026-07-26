---
status: accepted
---

# Self-hosted NestJS + PostgreSQL + Prisma + Docker Compose

MeetFix's backend is NestJS (REST API) with PostgreSQL via Prisma (schema + migrations), packaged as a portable `docker-compose` stack (API, Postgres, Caddy reverse proxy with automatic Let's Encrypt TLS, local-disk file storage, cron-scheduled `pg_dump` backups). We considered Cloudflare Workers + D1 (serverless, near-zero ops) and Supabase (Postgres + Auth + storage as a managed one-stop backend), both of which would have been faster to stand up.

We chose the self-hosted route because the deployment target is intentionally undecided (school's own server vs. a VPS the developer controls — see the deployment question left open during design), and because student/staff data may be subject to the school's own data-residency expectations. A platform-hosted backend (Cloudflare account, Supabase project) would tie the system's data location and availability to a third party the school hasn't necessarily vetted. `docker-compose up` on any Linux host — school-owned or not — was the deciding requirement.

The trade-off: no managed scaling, and the school (or the developer) is responsible for the host machine, OS patching, and disk space for backups/uploads. This is acceptable at single-school scale.
