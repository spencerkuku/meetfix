---
status: accepted
---

# Single-school scope, no multi-tenancy

MeetFix serves exactly one school per deployment. We considered building multi-tenant SaaS from the start (one system, many schools, tenant-isolated data) so a future second school wouldn't require a re-architecture. We rejected it: at this stage there is one known customer, and tenant isolation (per-tenant data scoping, subdomain routing, cross-tenant admin tooling) would roughly double the initial build for a need that doesn't exist yet.

If a second school signs on later, the options are (a) deploy a second independent instance of this same codebase, or (b) retrofit multi-tenancy — both are real quarter-scale efforts, which is why this is recorded rather than left implicit. Nothing in the data model should be *designed* to make (b) harder than it has to be (e.g. avoid baking single-school assumptions into IDs), but no tenant-scoping work should be done preemptively either.
