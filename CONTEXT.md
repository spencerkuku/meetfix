# MeetFix

A single-school system for booking meeting/classrooms and reporting facility repairs. One deployment serves exactly one school — there is no multi-tenancy.

## Language

### People & Access

**User**:
Any authenticated person in the system — a row in the `User` table. Every Role below is a User; "User" is also overloaded as a Role name (see below), so when precision matters say "the User entity" vs. "the USER role."
_Avoid_: Account (see Account below, which is a distinct concept), Member

**Role**:
One of three fixed permission levels assigned to a User: `USER`, `FACILITY_MANAGER`, `ADMIN`. Roles are exclusive — a User has exactly one.
_Avoid_: Permission, Group

**USER (role)**:
The default role. Can create Bookings and submit Repair Tickets for themselves.

**FACILITY_MANAGER (role)**:
Handles both facility responsibilities at this school, since they're always held by the same staff member: can view and act on all Repair Tickets from a shared, unassigned queue (claims a ticket by moving its status forward — there is no explicit "assign to me" action; can also revert a ticket's status one step backward, e.g. to undo an accidental claim or reopen a ticket closed too soon — see Repair Status), and approves or rejects Bookings for Rooms that require approval. Also manages Rooms and Repair Categories, a responsibility shared with ADMIN.
_Avoid_: Maintenance, Room Manager (the two separate roles this one replaces)

**ADMIN (role)**:
Manages Rooms, Repair Categories, Role assignment, the Auto-Approved Domain list, and Account Approval for Pending Accounts. Role assignment, the Auto-Approved Domain list, and Account Approval are ADMIN-exclusive; Rooms and Repair Categories are shared with FACILITY_MANAGER. Holds no special booking/repair authority beyond that.

**Account**:
The credential record backing a User's ability to log in — either a Google Workspace identity or a school-issued email + password pair. Two Users cannot share one Account; every Account maps to exactly one User. Google Workspace login is itself a per-deployment configuration detail, not a guarantee: it's only available when the deployment has `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` configured (see ADR-0005) — a school with no Google Workspace runs with password-only Accounts.
_Avoid_: Login, Credentials

**Account Status**:
Whether an Account (password-based only — Google accounts are always immediately usable) may be used to log in: `PENDING` (awaiting an Admin's Account Approval), `ACTIVE`, `SUSPENDED`, or `REJECTED` (see Account Rejection).
_Avoid_: Verified, Enabled

**Account Approval**:
An Admin's act of moving a Pending Account to Active and assigning it a Role. Distinct from Booking Approval — different actor, different object, different consequence. Triggered only for password-registered emails outside the Auto-Approved Domain list.

**Account Rejection**:
An Admin's act of moving a Pending Account to Rejected, optionally with a short reason. Distinct from Booking Approval's `REJECTED` Booking Status — a different concept on a different entity. Unlike Account Approval, the underlying User/Account row is kept rather than acted on further: a later password registration with the same email reuses that row (resetting it back to Pending, or straight to Active if the email now matches an Auto-Approved Domain) instead of being blocked, so one rejection doesn't permanently lock an applicant out. The Account keeps only its most recent rejection's reason/timestamp, shown to the Admin reviewing that email's next resubmission; earlier rejections remain in the Audit Log Entry history only.

**Auto-Approved Domain**:
An email domain (e.g. `school.edu.tw`) on an Admin-maintained list. A password registration whose email matches skips Account Approval and activates immediately with the USER role. Each entry may optionally be marked to also trust its subdomains (e.g. `dept.school.edu.tw`) — off by default, so widening one entry (typically the school's own domain) never widens another (e.g. a vendor's domain added for unrelated reasons). Password registration performs no email-ownership verification, so this match is against a self-reported string, not a confirmed mailbox.

### Rooms & Bookings

**Room**:
A physical bookable space (classroom, meeting room, etc.), with a location, and optionally a capacity, equipment list, and photo, plus a flag for whether Bookings against it require approval. Only a name and location are required to create one.

**Booking**:
A claim on a Room for a specific time range, made by a User. Identified by Room + time range, not by title.
_Avoid_: Reservation, Appointment

**Booking Status**:
One of `CONFIRMED`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED`. A Booking in `CONFIRMED` or `PENDING_APPROVAL` status holds its time slot exclusively — no other Booking may overlap it in either status. `CANCELLED` is a historical status only — no current action produces it; a Booking releases its slot either by being `REJECTED` at Booking Approval or by Booking Deletion.

**Booking Approval**:
A FACILITY_MANAGER's act of setting a `PENDING_APPROVAL` Booking to `CONFIRMED` or `REJECTED`. Distinct from Account Approval.

**Slot Conflict**:
The condition where a new Booking's time range overlaps an existing Booking in `CONFIRMED` or `PENDING_APPROVAL` status on the same Room. Always rejected at creation time — never surfaced as a warning to resolve later.

**Booking Deletion**:
The owner (or an ADMIN) removing a future Booking from all views regardless of its current `Booking Status`. The only self-service way to give up a Booking — there is no separate "cancel" action. Implemented as a soft delete (a `deletedAt` timestamp); a past or in-progress Booking cannot be deleted.

**Booking Editing**:
The owner (or an ADMIN) changing a future, still-active (`CONFIRMED` or `PENDING_APPROVAL`) Booking's title, description, time range, or Room in place, instead of deleting and recreating it. Changing the time range or Room re-runs the Slot Conflict check and recomputes `Booking Status` exactly as Booking creation would (excluding the Booking's own current slot); editing only the title or description never touches status. A past, in-progress, `REJECTED`, or `CANCELLED` Booking cannot be edited — the same restriction as Booking Deletion.

### Repairs

**Repair Ticket**:
A report of a facility problem at a free-text location, filed by a User. Not tied to a Room record.
_Avoid_: Repair Request, Maintenance Ticket

**Repair Status**:
One of `PENDING`, `IN_PROGRESS`, `COMPLETED`. Set by whichever FACILITY_MANAGER user picks up the ticket — there is no per-ticket assignee field. Normally advances one step forward at a time (`PENDING`→`IN_PROGRESS`→`COMPLETED`, no skipping), but a FACILITY_MANAGER/ADMIN user may also revert it one step backward (`IN_PROGRESS`→`PENDING`, `COMPLETED`→`IN_PROGRESS`) — reverting two steps at once (e.g. `COMPLETED`→`PENDING` directly) is not allowed. Every change, forward or backward, is recorded as an Audit Log Entry.

**Repair Ticket Editing/Deletion**:
The reporter (or an ADMIN) changing a Repair Ticket's location, category, description, or photo, or removing it entirely (soft delete via a `deletedAt` timestamp, mirroring Booking Deletion). Only available while the ticket is still `PENDING` — once a FACILITY_MANAGER user has claimed it (`IN_PROGRESS`) or finished it (`COMPLETED`), neither editing nor deleting is possible.

**Repair Category**:
An Admin-managed classification for Repair Tickets (e.g. "硬體設備", "冷氣空調"). Categories are freely added/removed by Admins and are not fixed at the code level.

### Operational

**Audit Log Entry**:
An immutable record of who performed a state-changing action, when, and on what — currently scoped to Role changes, Booking Approvals, Account Approvals, and Repair Status changes. Also covers one deliberate exception to "state-changing": a FACILITY_MANAGER/ADMIN bulk-exporting Repair Ticket data, recorded even though the export itself is read-only, because it's a sensitive enough operation on Repair Ticket data to warrant the same audit trail.
