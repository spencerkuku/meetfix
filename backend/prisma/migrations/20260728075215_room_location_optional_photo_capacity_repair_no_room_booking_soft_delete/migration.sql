/*
  Warnings:

  - You are about to drop the column `roomId` on the `RepairTicket` table. All the data in the column will be lost.
  - Added the required column `location` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RepairTicket" DROP CONSTRAINT "RepairTicket_roomId_fkey";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RepairTicket" DROP COLUMN "roomId";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "location" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "capacity" DROP NOT NULL,
ALTER COLUMN "imageUrl" DROP NOT NULL;
ALTER TABLE "Room" ALTER COLUMN "location" DROP DEFAULT;
