-- AlterTable
ALTER TABLE "users" ADD COLUMN "InviteToken" VARCHAR,
ADD COLUMN "InviteTokenExpiry" TIMESTAMP(6),
ADD COLUMN "InviteTokenUsed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "users_InviteToken_key" ON "users"("InviteToken");
