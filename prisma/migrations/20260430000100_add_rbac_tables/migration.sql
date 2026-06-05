-- CreateTable
CREATE TABLE "roles" (
    "RoleID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "RoleName" VARCHAR NOT NULL,
    "Description" VARCHAR,
    "IsSystem" BOOLEAN NOT NULL DEFAULT false,
    "CreatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CreatedByID" UUID,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("RoleID")
);

-- CreateTable
CREATE TABLE "permissions" (
    "PermissionID" UUID NOT NULL DEFAULT gen_random_uuid(),
    "PermissionKey" VARCHAR NOT NULL,
    "Description" VARCHAR,
    "Module" VARCHAR NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("PermissionID")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "RoleID" UUID NOT NULL,
    "PermissionID" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("RoleID","PermissionID")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_RoleName_key" ON "roles"("RoleName");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_PermissionKey_key" ON "permissions"("PermissionKey");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_RoleID_fkey" FOREIGN KEY ("RoleID") REFERENCES "roles"("RoleID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_PermissionID_fkey" FOREIGN KEY ("PermissionID") REFERENCES "permissions"("PermissionID") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable users: add RoleID FK (keeping Role varchar for backward compat)
ALTER TABLE "users" ADD COLUMN "RoleID" UUID;

-- CreateIndex
CREATE INDEX "users_RoleID_idx" ON "users"("RoleID");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_RoleID_fkey" FOREIGN KEY ("RoleID") REFERENCES "roles"("RoleID") ON DELETE SET NULL ON UPDATE CASCADE;
