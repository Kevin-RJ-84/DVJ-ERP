import { redirect } from "next/navigation";
import { ClientManagement } from "@/components/clients/ClientManagement";
import { GroupPageFrame } from "@/components/layout/GroupPageFrame";
import { getServerSession } from "@/lib/auth-server";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/rbac";

export default async function ClientsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");

  const canAccess = await hasPermission(session.userId, "clients.view");
  if (!canAccess) redirect("/dashboard");

  const clients = await db.clients.findMany({
    orderBy: [{ OverallRank: { sort: "asc", nulls: "last" } }, { PartyName: "asc" }],
    select: {
      ClientID: true,
      PartyCode: true,
      PartyName: true,
      CloseToExpiryDays: true,
      IsStockPullAllowed: true,
      CreatedAt: true,
      OverallRank: true,
      OverallScore: true,
    },
  });

  const initialClients = clients.map((c) => ({
    ...c,
    CreatedAt: c.CreatedAt.toISOString(),
    OverallScore: c.OverallScore ? c.OverallScore.toString() : null,
  }));

  return (
    <GroupPageFrame contentFill className="w-full">
      <ClientManagement initialClients={initialClients} />
    </GroupPageFrame>
  );
}
