"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { LoginForm } from "@/components/auth/LoginForm";
import { LOGIN_TOKENS } from "@/components/auth/login-design-tokens";
import logoWhite from "@/dv-jewelers-w.a320a7c1.png";

const JewelryLoginScene = dynamic(
  () => import("@/components/auth/JewelryLoginScene").then((m) => m.JewelryLoginScene),
  { ssr: false },
);

export default function LoginPage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-slate-950">
      <div aria-hidden className="absolute inset-0 z-0">
        <Image
          src="/login-bg.jpg"
          alt=""
          fill
          priority
          quality={90}
          sizes="100vw"
          className="object-cover object-center saturate-[1.08]"
        />
        <div className="absolute inset-0 bg-slate-950/62" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_22%,rgba(14,165,233,0.16),transparent_48%),radial-gradient(circle_at_80%_75%,rgba(251,191,36,0.18),transparent_40%)]" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/78 via-slate-900/52 to-slate-950/76" />
        <div className="hidden lg:block">
          <JewelryLoginScene />
        </div>
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: LOGIN_TOKENS.motion.durationBase,
            ease: LOGIN_TOKENS.motion.easeStandard,
          }}
          className={[
            "relative w-full max-w-6xl overflow-hidden rounded-[2rem]",
            "border border-white/35 bg-gradient-to-br from-white/[0.16] via-slate-200/[0.06] to-sky-100/[0.04]",
            "shadow-[0_32px_80px_-12px_rgba(0,0,0,0.58),inset_0_1px_0_0_rgba(255,255,255,0.26),0_0_0_1px_rgba(51,65,85,0.34)]",
            "backdrop-blur-3xl backdrop-saturate-150",
          ].join(" ")}
        >
          <div className="grid min-h-[min(620px,92vh)] grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <aside className="relative flex flex-col justify-between gap-10 p-8 text-white sm:p-10 lg:p-12 lg:pr-10">
              <div className="space-y-7">
                <div className="space-y-3">
                  <span className="inline-block w-[210px] sm:w-[230px]">
                    <Image
                      src={logoWhite}
                      alt="DV Jewelry Corp"
                      width={230}
                      height={74}
                      priority
                      sizes="(max-width: 640px) 210px, 230px"
                      className="h-auto w-full drop-shadow-[0_3px_18px_rgba(0,0,0,0.22)]"
                    />
                  </span>
                  <div
                    className="inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]"
                    style={{
                      color: LOGIN_TOKENS.color.platinum,
                      borderColor: "rgba(226,232,240,0.34)",
                      backgroundColor: "rgba(15,23,42,0.5)",
                    }}
                  >
                    DVJ ERP Workspace
                  </div>
                </div>

                <p className="max-w-md text-sm leading-relaxed text-white/82">
                  Precision workspace for diamond stock, memo return windows, and
                  replenishment decisions across boutiques and internal teams.
                </p>

                <h1
                  className="max-w-2xl font-serif leading-tight tracking-wide text-white"
                  style={{ fontSize: LOGIN_TOKENS.typography.display }}
                >
                  Jewelry operations, orchestrated.
                </h1>
                <p className="max-w-xl text-sm leading-relaxed text-white/76">
                  Track every stone movement, protect margin on memo cycles, and keep
                  signature pieces available with confidence.
                </p>
              </div>

              <div className="space-y-5 border-t border-white/18 pt-6">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-xl border border-white/20 bg-white/10 px-2 py-3 backdrop-blur-md">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Diamond ledger</p>
                    <p className="mt-1 text-lg font-semibold text-white">Unified</p>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-white/10 px-2 py-3 backdrop-blur-md">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Memo cycle</p>
                    <p className="mt-1 text-lg font-semibold text-white">Controlled</p>
                  </div>
                  <div className="rounded-xl border border-white/20 bg-white/10 px-2 py-3 backdrop-blur-md">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/62">Reorder engine</p>
                    <p className="mt-1 text-lg font-semibold text-white">Guided</p>
                  </div>
                </div>

                <p className="pt-4 text-xs tracking-wide text-white/45">
                  dvjewelrycorp.com
                </p>
              </div>
            </aside>

            <div className="relative flex flex-col justify-center border-t border-white/20 p-8 sm:p-10 lg:border-l lg:border-t-0 lg:pl-12 lg:pr-10">
              <motion.div
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: LOGIN_TOKENS.motion.durationBase,
                  ease: LOGIN_TOKENS.motion.easeSoft,
                  delay: 0.08,
                }}
                className="mx-auto w-full max-w-sm rounded-2xl border border-white/16 bg-slate-950/26 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl sm:p-7"
                style={{
                  borderColor: "rgba(212,175,55,0.22)",
                  backgroundColor: "rgba(15,23,42,0.42)",
                }}
              >
                <h2 className="text-center font-serif text-3xl text-white sm:text-4xl">
                  Login
                </h2>
                <p className="mt-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white/52">
                  Internal access - jewelry operations
                </p>

                <div className="mt-8">
                  <LoginForm variant="erpGlass" />
                </div>

                <div className="mt-7 flex items-center justify-between gap-4 text-sm">
                  <Link
                    href="/forgot-password"
                    className="font-medium text-white/82 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline"
                  >
                    Forgot password?
                  </Link>
                  <span className="text-white/44">DVJ ERP</span>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.section>
      </div>
    </main>
  );
}


