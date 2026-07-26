---
status: accepted
---

# Dual authentication: Google Workspace OAuth + domain-gated password accounts

Login supports two methods against one `User`/Role model: Google OAuth restricted to the school's Workspace domain (`hd` parameter), and traditional email+password registration. A single method (Google-only) would have been simpler — no password hashing, no reset flow, no Account Approval state machine — but it can't serve people without a school Google account: outside vendors doing repair work, or staff who for whatever reason aren't provisioned in Workspace.

To keep password registration from becoming an open door, it's gated by an Admin-maintained Auto-Approved Domain list: emails matching a listed domain activate immediately as USER; anything else lands in `PENDING` and needs explicit Account Approval by an Admin, who assigns the Role at that point (e.g. MAINTENANCE for a vendor). This means two independent "approval" concepts exist in the system — Account Approval (an Admin activating a login) and Booking Approval (a ROOM_MANAGER approving a room request) — deliberately kept separate in both name and code (see `CONTEXT.md`) so they aren't confused during implementation or later reading.
