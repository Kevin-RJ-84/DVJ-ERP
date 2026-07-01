"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    src: "/login-carousel/01-woman-hands-rings.jpg",
    alt: "Elegant diamond rings and bracelets on a woman's hands",
    title: "Every stone, accounted for",
    description:
      "Track diamond stock, memo cycles, and replenishment across your entire catalog from one workspace.",
  },
  {
    src: "/login-carousel/02-gold-necklace-shirt.jpg",
    alt: "Woman wearing a gold necklace and earrings",
    title: "Client relationships, elevated",
    description:
      "Rankings, party defaults, and sales history help your team curate the right pieces for every boutique.",
  },
  {
    src: "/login-carousel/03-bracelets-rock.jpg",
    alt: "Gold bracelets displayed on stone",
    title: "Inventory you can trust",
    description:
      "Live ERP sync keeps warehouse stock, memos, and holds aligned with what your floor team sees.",
  },
  {
    src: "/login-carousel/04-gold-rings.jpg",
    alt: "Three gold studded rings",
    title: "Precision replenishment",
    description:
      "Style-level planning with memo, hold, and pullback allocation — built for fine jewelry operations.",
  },
  {
    src: "/login-carousel/05-rings-table.jpg",
    alt: "Rings displayed on a table",
    title: "Margin-aware decisions",
    description:
      "Sales rankings and profit metrics guide what to restock, pull back, and prioritize for each client.",
  },
  {
    src: "/login-carousel/06-hand-jewelry.jpg",
    alt: "Hand presenting fine jewelry",
    title: "Operations orchestrated",
    description:
      "From upload to confirm, DVJ ERP connects sales data, stock, and team workflows in one place.",
  },
  {
    src: "/login-carousel/07-elegant-hands.jpg",
    alt: "Elegant jewelry on hands",
    title: "Built for DV Jewelry Corp",
    description:
      "Your internal command center for stock review, factory orders, and replenishment history.",
  },
] as const;

const AUTO_ADVANCE_MS = 6000;

export function LoginCarousel({
  className,
  variant = "card",
}: {
  className?: string;
  variant?: "card" | "fullBleed";
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const slide = SLIDES[index];

  const goTo = useCallback((next: number) => {
    setIndex((next + SLIDES.length) % SLIDES.length);
  }, []);

  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);
  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % SLIDES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="DV Jewelry highlights"
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden",
        variant === "card" && "clay-dark min-h-[380px] rounded-[1.75rem]",
        variant === "fullBleed" && "min-h-full bg-[#1a1a1a]",
        className,
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      {SLIDES.map((item, i) => (
        <div
          key={item.src}
          aria-hidden={i !== index}
          className={cn(
            "absolute inset-0 transition-opacity motion-safe:duration-700",
            i === index ? "opacity-100" : "opacity-0",
          )}
        >
          <Image
            src={item.src}
            alt={i === index ? item.alt : ""}
            fill
            priority={i === 0}
            sizes="(max-width: 1024px) 100vw, 56vw"
            className="object-cover object-center opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a]/95 via-[#1a1a1a]/45 to-[#1a1a1a]/20" />
        </div>
      ))}

      <div className="relative z-10 mt-auto px-8 pb-10 pt-24 sm:px-10 sm:pb-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
          DVJ ERP
        </p>
        <h2
          className="font-display mt-3 max-w-md text-3xl leading-tight text-white sm:text-[2rem]"
          aria-live="polite"
        >
          {slide.title}
        </h2>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/72">
          {slide.description}
        </p>
      </div>

      <div className="absolute inset-y-0 left-0 z-20 flex items-center pl-4">
        <button
          type="button"
          onClick={goPrev}
          className="clay-raised flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="Previous slide"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="absolute inset-y-0 right-0 z-20 flex items-center pr-4">
        <button
          type="button"
          onClick={goNext}
          className="clay-raised flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:scale-[1.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="Next slide"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <div
        className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
        role="tablist"
        aria-label="Carousel slides"
      >
        {SLIDES.map((item, i) => (
          <button
            key={item.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Go to slide ${i + 1}: ${item.title}`}
            onClick={() => goTo(i)}
            className={cn(
              "h-2 rounded-full transition-all motion-safe:duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50",
              i === index ? "w-7 bg-white" : "w-2 bg-white/40 hover:bg-white/65",
            )}
          />
        ))}
      </div>
    </section>
  );
}
