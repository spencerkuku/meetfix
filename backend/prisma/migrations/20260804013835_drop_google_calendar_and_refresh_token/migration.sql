-- Google Calendar sync and its supporting refresh-token storage are
-- removed. Google login itself is unaffected — it never needed these
-- columns, only the (now-deleted) Calendar sync feature did.

ALTER TABLE "Account" DROP COLUMN "googleRefreshToken";

ALTER TABLE "Booking" DROP COLUMN "googleEventId";
