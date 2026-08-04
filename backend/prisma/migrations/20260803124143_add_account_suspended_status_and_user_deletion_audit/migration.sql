-- AlterEnum
ALTER TYPE "AccountStatus" ADD VALUE 'SUSPENDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_SUSPENSION';
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_REACTIVATION';
ALTER TYPE "AuditAction" ADD VALUE 'USER_DELETION';

-- DropForeignKey
ALTER TABLE "AuditLogEntry" DROP CONSTRAINT "AuditLogEntry_actorId_fkey";

-- AlterTable
ALTER TABLE "AuditLogEntry" ADD COLUMN     "actorName" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
