import { redirect } from "next/navigation";

/** Home redirects to the dashboard hub. */
export default function DashboardHomePage() {
  redirect("/dashboard");
}
