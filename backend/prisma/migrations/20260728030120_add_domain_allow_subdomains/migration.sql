-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'AUTO_APPROVED_DOMAIN_CHANGE';

-- AlterTable
ALTER TABLE "AutoApprovedDomain" ADD COLUMN     "allowSubdomains" BOOLEAN NOT NULL DEFAULT false;
