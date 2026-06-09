import { redirect } from "next/navigation";
import { ExcelConfigManager } from "@/components/excel-config/ExcelConfigManager";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { getServerSession } from "@/lib/auth-server";
import { hasPermission } from "@/lib/rbac";

export default async function ExcelConfigPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "excel_config.view");
  if (!canAccess) redirect("/dashboard");

  return (
    <GroupPageFrame className="w-full">
      <ExcelConfigManager />
    </GroupPageFrame>
  );
}
