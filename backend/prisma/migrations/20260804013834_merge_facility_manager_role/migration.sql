-- Merge MAINTENANCE and ROOM_MANAGER into a single FACILITY_MANAGER role.
-- Postgres enums can't have values renamed/removed in place, so this
-- recreates the type: existing MAINTENANCE/ROOM_MANAGER Users are converted
-- to FACILITY_MANAGER as part of the same column-type change.

CREATE TYPE "Role_new" AS ENUM ('USER', 'FACILITY_MANAGER', 'ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role_new" USING (
  CASE "role"::text
    WHEN 'MAINTENANCE' THEN 'FACILITY_MANAGER'
    WHEN 'ROOM_MANAGER' THEN 'FACILITY_MANAGER'
    ELSE "role"::text
  END
)::"Role_new";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

DROP TYPE "Role";

ALTER TYPE "Role_new" RENAME TO "Role";
