"use client";

import Image from "next/image";
import Link from "next/link";
import { LoginCarousel } from "@/components/auth/LoginCarousel";
import { LoginForm } from "@/components/auth/LoginForm";

const LOGO = "/dv-jewelers.a808f139.png";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-card text-foreground lg:grid lg:min-h-screen lg:grid-cols-[minmax(0,56%)_minmax(0,44%)]">
      {/* Left — carousel fills column edge-to-edge (no padding gap) */}
      <div className="relative hidden min-h-screen bg-card lg:block">
        <LoginCarousel variant="fullBleed" className="absolute inset-0 min-h-screen" />
      </div>

      {/* Carousel (mobile — above form) */}
      <div className="bg-card px-4 pt-4 lg:hidden">
        <LoginCarousel className="h-[min(52vh,420px)]" />
      </div>

      {/* Right — sign-in form */}
      <div className="relative flex min-h-screen flex-col bg-card px-8 py-8 sm:px-12 lg:px-16 lg:py-10 xl:px-20">
        <header>
          <Link href="/login" className="inline-block">
            <Image
              src={LOGO}
              alt="DV Jewelry Corp"
              width={168}
              height={54}
              priority
              className="h-11 w-auto sm:h-12"
            />
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center py-10 lg:max-w-xl lg:py-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            DVJ ERP · Internal
          </p>
          <h1 className="font-display mt-3 text-3xl text-foreground sm:text-4xl">
            Welcome back
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Sign in to your jewelry operations workspace
          </p>

          <div className="mt-10 w-full max-w-md lg:max-w-none">
            <LoginForm variant="dashboard" />
          </div>

          <div className="mt-8 flex w-full max-w-md items-center justify-between gap-4 text-sm lg:max-w-none">
            <Link
              href="/forgot-password"
              className="font-medium text-foreground underline-offset-4 transition-colors hover:underline"
            >
              Forgot password?
            </Link>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Secure access
            </span>
          </div>
        </div>

        <footer className="flex flex-col gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} DV Jewelry Corp</span>
          <span>Central Ledger · FY 2026</span>
        </footer>
      </div>
    </main>
  );
}
