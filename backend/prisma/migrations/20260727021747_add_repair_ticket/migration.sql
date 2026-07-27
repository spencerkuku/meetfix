-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "RepairCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairTicket" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userClass" TEXT,
    "userPhone" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "RepairStatus" NOT NULL DEFAULT 'PENDING',
    "adminReply" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairCategory_name_key" ON "RepairCategory"("name");

-- AddForeignKey
ALTER TABLE "RepairTicket" ADD CONSTRAINT "RepairTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default Repair Categories (freely editable by Admins afterwards —
-- these are just a sensible starting list, not fixed at the code level).
INSERT INTO "RepairCategory" ("id", "name") VALUES
    ('seed-repair-category-hardware', '硬體設備'),
    ('seed-repair-category-network', '軟體/網路'),
    ('seed-repair-category-cleaning', '環境清潔'),
    ('seed-repair-category-hvac', '冷氣空調'),
    ('seed-repair-category-furniture', '桌椅家具'),
    ('seed-repair-category-other', '其他');
