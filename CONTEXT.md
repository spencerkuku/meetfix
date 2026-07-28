# MeetFix

A single-school system for booking meeting/classrooms and reporting facility repairs. One deployment serves exactly one school — there is no multi-tenancy.

## Language

### People & Access

**User**:
Any authenticated person in the system — a row in the `User` table. Every Role below is a User; "User" is also overloaded as a Role name (see below), so when precision matters say "the User entity" vs. "the USER role."
_Avoid_: Account (see Account below, which is a distinct concept), Member

**Role**:
One of four fixed permission levels assigned to a User: `USER`, `MAINTENANCE`, `ROOM_MANAGER`, `ADMIN`. Roles are exclusive (a User has exactly one) and are never merged/combined, even when the same person happens to hold two jobs at the school.
_Avoid_: Permission, Group

**USER (role)**:
The default role. Can create Bookings and submit Repair Tickets for themselves.

**MAINTENANCE (role)**:
Can view and act on all Repair Tickets from a shared, unassigned queue. Claims a ticket by moving its status forward — there is no explicit "assign to me" action.

**ROOM_MANAGER (role)**:
Approves or rejects Bookings for Rooms that require approval.

**ADMIN (role)**:
Manages Rooms, Repair Categories, Role assignment, the Auto-Approved Domain list, and Account Approval for Pending Accounts. Holds no special booking/repair authority beyond that.

**Account**:
The credential record backing a User's ability to log in — either a Google Workspace identity or a school-issued email + password pair. Two Users cannot share one Account; every Account maps to exactly one User.
_Avoid_: Login, Credentials

**Account Status**:
Whether an Account (password-based only — Google accounts are always immediately usable) may be used to log in: `PENDING` (awaiting an Admin's Account Approval) or `ACTIVE`.
_Avoid_: Verified, Enabled

**Account Approval**:
An Admin's act of moving a Pending Account to Active and assigning it a Role. Distinct from Booking Approval — different actor, different object, different consequence. Triggered only for password-registered emails outside the Auto-Approved Domain list.

**Auto-Approved Domain**:
An email domain (e.g. `school.edu.tw`) on an Admin-maintained list. A password registration whose email matches skips Account Approval and activates immediately with the USER role. Each entry may optionally be marked to also trust its subdomains (e.g. `dept.school.edu.tw`) — off by default, so widening one entry (typically the school's own domain) never widens another (e.g. a vendor's domain added for unrelated reasons). Password registration performs no email-ownership verification, so this match is against a self-reported string, not a confirmed mailbox.

### Rooms & Bookings

**Room**:
A physical bookable space (classroom, meeting room, etc.), with a capacity, equipment list, and a flag for whether Bookings against it require approval.

**Booking**:
A claim on a Room for a specific time range, made by a User. Identified by Room + time range, not by title.
_Avoid_: Reservation, Appointment

**Booking Status**:
One of `CONFIRMED`, `PENDING_APPROVAL`, `REJECTED`, `CANCELLED`. A Booking in `CONFIRMED` or `PENDING_APPROVAL` status holds its time slot exclusively — no other Booking may overlap it in either status. Only `REJECTED` and `CANCELLED` release the slot.

**Booking Approval**:
A ROOM_MANAGER's act of setting a `PENDING_APPROVAL` Booking to `CONFIRMED` or `REJECTED`. Distinct from Account Approval.

**Slot Conflict**:
The condition where a new Booking's time range overlaps an existing Booking in `CONFIRMED` or `PENDING_APPROVAL` status on the same Room. Always rejected at creation time — never surfaced as a warning to resolve later.

### Repairs

**Repair Ticket**:
A report of a facility problem tied to a Room (or a free-text location, for shared spaces without a Room record), filed by a User.
_Avoid_: Repair Request, Maintenance Ticket

**Repair Status**:
One of `PENDING`, `IN_PROGRESS`, `COMPLETED`. Set by whichever MAINTENANCE user picks up the ticket — there is no per-ticket assignee field.

**Repair Category**:
An Admin-managed classification for Repair Tickets (e.g. "硬體設備", "冷氣空調"). Categories are freely added/removed by Admins and are not fixed at the code level.

### Operational

**Audit Log Entry**:
An immutable record of who performed a state-changing action, when, and on what — currently scoped to Role changes, Booking Approvals, Account Approvals, and Repair Status changes.
