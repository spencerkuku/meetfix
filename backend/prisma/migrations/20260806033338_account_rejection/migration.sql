-- AlterEnum
ALTER TYPE "AccountStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_REJECTION';

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "lastRejectedAt" TIMESTAMP(3),
ADD COLUMN     "lastRejectionReason" TEXT;
