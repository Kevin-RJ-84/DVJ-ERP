import { cookies } from "next/headers";
import { DashboardChrome } from "@/components/layout/DashboardChrome";
import { getJwtCookieName } from "@/lib/auth";
import { resolveDashboardSession } from "@/lib/auth-session-resolve";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getJwtCookieName())?.value;
  const session = await resolveDashboardSession(token);

  return <DashboardChrome session={session}>{children}</DashboardChrome>;
}
