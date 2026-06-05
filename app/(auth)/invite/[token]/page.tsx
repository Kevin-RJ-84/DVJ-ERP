import { InviteSetupForm } from "@/components/auth/InviteSetupForm";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  return (
    <main className="erp-mesh-bg flex min-h-screen items-center justify-center p-6">
      <section className="w-full max-w-lg rounded-2xl border border-amber-100/50 bg-[#fffdf9]/82 p-8 shadow-[0_16px_48px_-12px_rgba(69,26,3,0.2)] backdrop-blur-2xl sm:p-10">
        <InviteSetupForm token={token} />
      </section>
    </main>
  );
}
