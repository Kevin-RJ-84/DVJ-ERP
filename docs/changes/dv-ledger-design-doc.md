# DV Ledger — Dashboard Design System & Recreation Prompt

A complete, copy‑pasteable spec for the dashboard aesthetic: warm off‑white canvas, white bento cards, near‑black CTA, emerald accent, Inter type, 2xl rounded corners, no glow/heavy shadows.

---

## 1. Master Prompt (paste into any AI builder)

> Build a SaaS analytics dashboard with the following exact design system. Do not deviate.
>
> **Aesthetic**: clean minimal premium SaaS — Notion × Linear × Vercel. Warm off‑white canvas, pure white cards with hairline warm borders, near‑black text, generous spacing, no gradients (except a single subtle emerald area‑chart fill), no glow, no glassmorphism, no purple/indigo, no serifs.
>
> **Layout**: persistent 220px light sidebar on the left (labeled items, not icon‑only) + main content area. Topbar = page title on the left, narrow 320px rounded search pill in the middle‑left, then `ml-auto` group of: solid black "Create" pill, circular icon buttons (messages, notifications with red dot), circular avatar with initials. Main grid is a two‑column bento: `grid-cols-[minmax(0,1fr)_400px]` on xl, single column below. Left column = hero area chart → KPI bubble row (4‑up) → category mix bar chart → 2‑up (Top clients / Restock) → radar. Right rail = popular products → solid black "Today" metric card → activity feed → memo donut.
>
> **Colors** (oklch, defined as CSS variables):
> - `--background` warm off‑white `oklch(0.965 0.005 90)` (~#F5F4F0)
> - `--card` pure white
> - `--foreground` near black `oklch(0.18 0.005 90)` (~#0A0A0A)
> - `--border` warm hairline `oklch(0.91 0.006 85)` (~#ECEAE4)
> - `--secondary` / `--muted` `oklch(0.945–0.955 0.005 90)`
> - `--primary` = foreground (used for solid black CTA pill and "Today" card)
> - Accents (used literally in charts): emerald `#16a34a` (positive), red `#ef4444` (negative), amber `#f59e0b` (warning), neutral `#a3a39b` (forecast/secondary)
>
> **Type**: Inter, 400/500/600/700/800. Tabular nums for all numbers. Hero number 42px/bold/tight. Card titles 15px/600. Body 12–13px. Section eyebrow labels 11px uppercase tracking‑wider muted.
>
> **Shapes**: corners `rounded-2xl` (16px) for cards, `rounded-full` for all pills/buttons/avatars/search. Borders are 1px warm hairline. Shadow is barely there: `0 1px 2px rgba(20,20,18,0.04)`. No drop‑shadows on charts.
>
> **Components every card uses**: `SectionLabel` (15px semibold title + optional right action), `RangePill` (h‑7 rounded‑full secondary bg with chevron), `Delta` (emerald or red, arrow + percent, 11px semibold), segmented toggle (bg‑secondary p‑0.5 rounded‑full, active = white pill with shadow‑card).
>
> **Charts**: Recharts for bar/radar/donut; raw SVG for the hero area chart (820×190 viewBox). Hero area = thick `#16a34a` polyline (strokeWidth 4) + soft 22%→0% green gradient fill + dashed grey forecast line + dashed grid lines `#ECEAE4`. Bars stacked with `radius={[6,6,0,0]}` in foreground/emerald/neutral. Donut innerRadius 52, outerRadius 74, paddingAngle 3, cornerRadius 4, centered total label inside.
>
> **Density rules**: card padding `p-4 lg:p-5`, gap between cards `gap-4`, inner row padding `p-2 rounded-xl hover:bg-secondary`. Always `overflow-hidden` and `min-w-0` on flex children to prevent chart blowout.
>
> Build the dashboard now. Use the exact tokens, components, and grid above.

---

## 2. Visual Design Document

### 2.1 Brand
- **Voice**: editorial calm, precise, premium. No emojis, no exclamation marks.
- **Negative space first**: density comes from compact rows inside cards, not from cramming cards.

### 2.2 Color tokens (semantic only — never hardcode in components)

| Token | Light value (oklch) | Hex approx | Usage |
|---|---|---|---|
| `--background` | `0.965 0.005 90` | `#F5F4F0` | App canvas, sidebar |
| `--card` | `1 0 0` | `#FFFFFF` | All bento cards |
| `--foreground` | `0.18 0.005 90` | `#0A0A0A` | Text, primary CTA, "Today" card |
| `--primary` | = foreground | `#0A0A0A` | Solid black pill, dark metric card |
| `--secondary` | `0.945 0.005 90` | `#EFEDE8` | Pills, hover row, avatars |
| `--muted` | `0.955 0.005 90` | `#F1EFEA` | Subtle fills |
| `--muted-foreground` | `0.52 0.008 80` | `#8F8C84` | Secondary text, axis ticks |
| `--border` | `0.91 0.006 85` | `#ECEAE4` | Hairline borders, grid lines |
| **Emerald (positive)** | — | `#16a34a` | Up‑deltas, hero line, active dots |
| **Red (negative)** | — | `#ef4444` | Down‑deltas, critical |
| **Amber (warning)** | — | `#f59e0b` | Low stock, expiring |
| **Neutral** | — | `#a3a39b` | Forecast lines, inactive |

Avoid: purple, indigo, teal, gradients other than the single emerald area fill, glassmorphism, neon, claymorphism.

### 2.3 Typography
- Family: **Inter** (`400, 500, 600, 700, 800`), mono = **JetBrains Mono** for SKUs only.
- Scale:
  - Hero stat: `42px / 700 / tracking-tight / leading-none / tabular-nums`
  - Card title: `15px / 600 / tracking-tight`
  - Eyebrow: `11px / 600 / uppercase / tracking-wider / muted-foreground`
  - Row title: `13px / 600`
  - Body / meta: `11–12px / 500 / muted-foreground`
  - Numbers: always `tabular-nums`

### 2.4 Shape & elevation
- Radius scale: cards `1.25rem` (20px via `surface-card`) or `rounded-2xl` (16px), pills `rounded-full`, inner rows `rounded-xl` (12px).
- Borders: always `1px solid var(--border)`.
- Shadows: only `--shadow-card: 0 1px 2px rgba(20,20,18,0.04)`. Optional `--shadow-pop: 0 8px 24px -12px rgba(20,20,18,0.12)` for tooltips only.
- No ring, no glow, no inset.

### 2.5 Spacing & grid
- Page padding: `px-6 py-5 lg:px-8 lg:py-6`.
- Card padding: `p-4 lg:p-5`.
- Card → card gap: `gap-4`.
- Inner row: `p-2 gap-3 rounded-xl hover:bg-secondary`.
- Main grid: `grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start`.
- KPI bubbles: `grid grid-cols-2 lg:grid-cols-4 gap-2.5` inside their card.

### 2.6 Component patterns

**Pill (segmented toggle)**
```
container: bg-secondary p-0.5 rounded-full flex gap-0.5
inactive : px-3 h-7 text-[11px] font-semibold text-muted-foreground rounded-full
active   : bg-card text-foreground shadow-card
```

**RangePill** (`Last month ▾`)
```
inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-secondary
text-[11px] font-medium hover:bg-accent
```

**Delta**
```
emerald-600 if positive, red-500 if negative
inline-flex items-center gap-0.5 text-[11px] font-semibold
icon: ArrowUpRight / ArrowDownRight, 12px, strokeWidth 2.5
```

**Primary CTA**
```
h-10 px-5 rounded-full bg-foreground text-background
text-[13px] font-semibold hover:bg-foreground/90
```

**Circular icon button**
```
w-10 h-10 rounded-full bg-card border border-border
flex items-center justify-center hover:bg-secondary
```

**Dark "Today" metric card** (the single non‑white card on the page)
```
rounded-[1.25rem] bg-primary text-primary-foreground p-5 shadow-card
inner stat tiles: rounded-2xl bg-primary-foreground/10 px-3 py-2
```

### 2.7 Chart rules
- **Hero area chart**: raw SVG, `viewBox="0 0 820 190"`, `overflow-visible`. Polyline `#16a34a` strokeWidth 4, round caps. Gradient `#16a34a` 22% → 0%. Forecast = `#a3a39b` strokeDasharray `5 6`. Grid = horizontal dashed lines `#ECEAE4` `4 5`. Last point gets a 5px filled circle with 2px white stroke.
- **Bar**: Recharts, `CartesianGrid` vertical=false, `stroke="#ECEAE4"`. Stack colors in order `foreground → emerald → neutral-300`. `radius=[6,6,0,0]` on top bar. Axes: no line, no tick‑line, 11px `#9a9a93`.
- **Donut**: innerRadius 52 / outerRadius 74 / paddingAngle 3 / cornerRadius 4 / stroke none. Center label = big tabular total + tiny uppercase caption.
- **Radar**: PolarGrid `#ECEAE4`, two radars (forecast dashed grey 8% fill, actual emerald 18% fill, strokeWidth 2).
- **Tooltip**: `{ borderRadius: 12, border: "1px solid #ECEAE4", background: "white", boxShadow: "0 8px 24px -12px rgba(20,20,18,0.12)", fontSize: 12 }`.

### 2.8 Sidebar
- 220px wide, sticky, full height, `bg-sidebar` (= background), no border.
- Brand: 32px round black circle with white gem icon + bold 15px wordmark.
- Item: `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium`. Active = `bg-sidebar-accent text-foreground font-semibold`. Inactive = `text-muted-foreground hover:bg-sidebar-accent/60`.
- Icons 17px, strokeWidth 2.
- Bottom: divider + Support + Theme buttons in the same style.

### 2.9 Topbar
- Single row, no border underneath.
- Order: H1 page title (22px/700) → narrow 320px search pill → `ml-auto` cluster (black Create pill, message btn, bell with red dot, KD avatar).
- Search: `w-[320px] h-9 px-3.5 rounded-full bg-card border border-border`, 14px icon, 13px input.

---

## 3. Drop‑in code

### 3.1 `src/styles.css` (Tailwind v4, the bits that define the look)
```css
@import "tailwindcss" source(none);
@source "../src";
@import "tw-animate-css";
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap");

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-border: var(--border);
  --color-sidebar: var(--sidebar);
  --color-sidebar-accent: var(--sidebar-accent);
}

:root {
  --radius: 1rem;
  --background: oklch(0.965 0.005 90);
  --foreground: oklch(0.18 0.005 90);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.005 90);
  --primary: oklch(0.18 0.005 90);
  --primary-foreground: oklch(0.99 0 0);
  --secondary: oklch(0.945 0.005 90);
  --secondary-foreground: oklch(0.22 0.005 90);
  --muted: oklch(0.955 0.005 90);
  --muted-foreground: oklch(0.52 0.008 80);
  --accent: oklch(0.94 0.005 90);
  --accent-foreground: oklch(0.18 0.005 90);
  --border: oklch(0.91 0.006 85);
  --input: oklch(0.91 0.006 85);
  --ring: oklch(0.6 0.16 145);

  --sidebar: oklch(0.965 0.005 90);
  --sidebar-foreground: oklch(0.18 0.005 90);
  --sidebar-accent: oklch(0.93 0.005 90);
  --sidebar-accent-foreground: oklch(0.18 0.005 90);
  --sidebar-border: oklch(0.91 0.006 85);

  --shadow-card: 0 1px 2px rgba(20, 20, 18, 0.04);
  --shadow-pop: 0 8px 24px -12px rgba(20, 20, 18, 0.12);
}

@layer base {
  body { background: var(--color-background); color: var(--color-foreground);
         font-family: var(--font-sans); -webkit-font-smoothing: antialiased;
         font-feature-settings: "cv11", "ss01"; }
}

@layer utilities {
  .shadow-card { box-shadow: var(--shadow-card); }
  .shadow-pop  { box-shadow: var(--shadow-pop); }
  .surface-card {
    background: var(--card);
    border-radius: 1.25rem;
    border: 1px solid var(--border);
    box-shadow: var(--shadow-card);
  }
  @keyframes float-up { from { opacity:0; transform: translateY(8px);} to {opacity:1; transform:none;} }
  .animate-float-up { animation: float-up .5s cubic-bezier(.22,1,.36,1) both; }
  @keyframes grow-width { from { width: 0; } }
  .animate-grow-width { animation: grow-width 1s cubic-bezier(.22,1,.36,1) both; }
}
```

### 3.2 Sidebar (`Sidebar.tsx`)
```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { LayoutGrid, Package, Users, FileSpreadsheet, RefreshCw,
         MessageCircle, Moon, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/replenishment/stock",  label: "Stock Replenishment",  icon: Package },
  { to: "/replenishment/client", label: "Client Replenishment", icon: RefreshCw },
  { to: "/clients",      label: "Clients",      icon: Users },
  { to: "/excel-config", label: "Excel Config", icon: FileSpreadsheet },
];

export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="hidden lg:flex w-[220px] shrink-0 sticky top-0 self-start h-screen
                      z-40 flex-col py-5 px-3 bg-sidebar">
      <Link to="/" className="flex items-center gap-2.5 px-3 py-2 mb-6">
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background">
          <Gem className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <span className="font-bold text-[15px] tracking-tight">DV Ledger</span>
      </Link>
      <nav className="flex-1 flex flex-col gap-0.5">
        {items.map(({ to, label, icon: Icon }) => {
          const active = pathname === to;
          return (
            <Link key={to} to={to} className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors",
              active ? "bg-sidebar-accent text-foreground font-semibold"
                     : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}>
              <Icon className="w-[17px] h-[17px]" strokeWidth={2} />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col gap-1 pt-3 border-t border-border">
        {[{ icon: MessageCircle, label: "Support" }, { icon: Moon, label: "Theme" }].map(b => (
          <button key={b.label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl
            text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground">
            <b.icon className="w-[17px] h-[17px]" strokeWidth={2} />{b.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
```

### 3.3 Topbar (`Topbar.tsx`)
```tsx
import { Search, Bell, MessageCircle } from "lucide-react";

export function Topbar({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="flex items-center gap-4 mb-6">
      <h1 className="text-[22px] font-bold tracking-tight">{title}</h1>

      <div className="flex items-center gap-2 w-[320px] h-9 px-3.5 rounded-full bg-card border border-border">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" strokeWidth={2.2} />
        <input className="flex-1 min-w-0 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground"
               placeholder="Search anything..." />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button className="h-10 px-5 rounded-full bg-foreground text-background
                           text-[13px] font-semibold hover:bg-foreground/90">Create</button>
        <button className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary">
          <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
        </button>
        <button className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary relative">
          <Bell className="w-4 h-4" strokeWidth={2.2} />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-red-500" />
        </button>
        <button className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold">KD</button>
      </div>
    </header>
  );
}
```

### 3.4 Bento primitives (drop in any card)
```tsx
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, ChevronDown } from "lucide-react";

export const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("surface-card p-4 lg:p-5 overflow-hidden", className)}>{children}</div>
);

export const SectionLabel = ({ children, action }:
  { children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-[15px] font-semibold tracking-tight">{children}</h3>
    {action}
  </div>
);

export const RangePill = ({ label = "Last month" }: { label?: string }) => (
  <button className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full
                     bg-secondary text-[11px] font-medium hover:bg-accent">
    {label}<ChevronDown className="w-3 h-3" />
  </button>
);

export const Delta = ({ value, positive }: { value: string; positive: boolean }) => (
  <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold",
    positive ? "text-emerald-600" : "text-red-500")}>
    {positive ? <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} />
              : <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />}
    {value}
  </span>
);

export const Segmented = <T extends string>(
  { value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }
) => (
  <div className="bg-secondary p-0.5 rounded-full flex gap-0.5">
    {options.map(o => (
      <button key={o} onClick={() => onChange(o)} className={cn(
        "px-3 h-7 text-[11px] font-semibold rounded-full capitalize transition-all",
        value === o ? "bg-card text-foreground shadow-card"
                    : "text-muted-foreground hover:text-foreground"
      )}>{o}</button>
    ))}
  </div>
);
```

### 3.5 Page shell
```tsx
<main className="flex-1 min-w-0 px-6 py-5 lg:px-8 lg:py-6 animate-float-up">
  <Topbar title="Dashboard" />
  <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
    <div className="space-y-4 min-w-0">
      {/* Hero chart, KPI row, category mix, 2-up clients/restock, radar */}
    </div>
    <div className="space-y-4 min-w-0">
      {/* Popular products, dark Today card, activity feed, memo donut */}
    </div>
  </div>
</main>
```

### 3.6 Hero area chart (raw SVG — the signature element)
```tsx
<svg viewBox="0 0 820 190" className="h-full w-full overflow-visible">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stopColor="#16a34a" stopOpacity="0.22" />
      <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
    </linearGradient>
  </defs>
  {[44,86,128,170].map(y => (
    <line key={y} x1="18" x2="802" y1={y} y2={y}
          stroke="#ECEAE4" strokeDasharray="4 5" />
  ))}
  <polygon points={`18,170 ${points} 802,170`} fill="url(#g)" />
  <polyline points={forecastPoints} fill="none" stroke="#a3a39b"
            strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
  <polyline points={points} fill="none" stroke="#16a34a"
            strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
</svg>
```

---

## 4. Applying to other pages (Clients, Replenishment, Excel Config, etc.)

Every page must follow this skeleton:

```tsx
<main className="flex-1 min-w-0 px-6 py-5 lg:px-8 lg:py-6 animate-float-up">
  <Topbar title="Clients" />

  {/* Page-level toolbar row — same vocabulary as dashboard */}
  <div className="flex items-center gap-2 mb-4">
    <RangePill label="All segments" />
    <RangePill label="Last 30 days" />
    <div className="ml-auto"><Segmented value={view} options={["table","grid"]} onChange={setView}/></div>
  </div>

  {/* Content lives in surface-card containers, never floating */}
  <Card>
    {/* table / list / form — rows use p-2 rounded-xl hover:bg-secondary */}
  </Card>
</main>
```

Rules to keep aesthetic consistent across pages:
1. **One hero element per page.** Either a big number, a hero chart, or a hero table — never two.
2. **Cards are the only container.** No floating sections, no full‑bleed panels (except the dark Today card).
3. **Numbers always use `tabular-nums`** and the Delta component for change indicators.
4. **Filters and toggles** use only `RangePill` + `Segmented`. No native selects, no shadcn Select with default styling.
5. **Empty states**: centered `surface-card`, 14px round black circle icon, 20px semibold title, 13px muted body — no illustrations.
6. **Tables**: header row `text-[11px] uppercase tracking-wider text-muted-foreground font-semibold`; data rows `text-[13px]` with `hover:bg-secondary rounded-xl`; no zebra striping; no vertical borders.
7. **Forms**: inputs `h-10 rounded-xl bg-card border border-border px-3 text-[13px]`; labels `text-[12px] font-semibold mb-1.5`; submit = primary black pill.
8. **Status pills**: emerald/amber/red dot + label, never filled badges.
9. **Never** add: gradients, shadows beyond `shadow-card`, purple/indigo, serif fonts, glassmorphism, neumorphism, icon‑only sidebars.

---

## 5. Dependency checklist
- `tailwindcss@4`, `tw-animate-css`
- `lucide-react` (icons, strokeWidth 2–2.2)
- `recharts` (bar, radar, donut). Hero chart is raw SVG.
- `clsx` + `tailwind-merge` via `cn()` util.
- Inter + JetBrains Mono via Google Fonts.

That's the whole system. Stick to the tokens, the four primitives (`Card`, `SectionLabel`, `RangePill`, `Delta`, `Segmented`), and the two‑column bento grid, and every new page will read as the same product.

---

## 6. Changelog & Updates (v3.0)

### 6.1 Font loading
Google Fonts are loaded via `<link>` tags in `src/routes/__root.tsx`'s `<head>` (inside `RootShell`), NOT via `@import` in `src/styles.css`. Lightning CSS (Tailwind v4 transformer) cannot resolve remote `@import` URLs and returns a 500 on `/src/styles.css` if you try.

```tsx
// src/routes/__root.tsx — inside <head>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
/>
```

### 6.2 Motion system
All chart/card entrance motion is driven by a small set of utility keyframes defined under `@layer utilities` in `src/styles.css`. Use these instead of ad-hoc framer-motion for chart reveals.

| Utility | Duration | Easing | Used for |
|---|---|---|---|
| `.animate-float-up` | 0.5s | `cubic-bezier(0.22, 1, 0.36, 1)` | Page shell mount (`<main>`) |
| `.animate-grow-width` | 1.0s | `cubic-bezier(0.22, 1, 0.36, 1)` | Horizontal bars, progress fills |
| `.animate-draw` | 2.8s | `cubic-bezier(0.22, 1, 0.36, 1)` | SVG line draw (`stroke-dashoffset`) for the Product View polyline |
| `.animate-fade-rise` | 1.4s | `cubic-bezier(0.22, 1, 0.36, 1)` | Labels, axis ticks, secondary annotations |
| `.animate-pop-in` | 0.7s | `cubic-bezier(0.22, 1, 0.36, 1)` | SVG points/dots (transform-origin: center via `transform-box: fill-box`) |

Rules:
1. Page enters with `.animate-float-up` ONCE on mount.
2. Hero/Product-View line uses `.animate-draw` so the path traces point-to-point slowly (~2.8s). Dots on the line use `.animate-pop-in` staggered via inline `animationDelay`.
3. Recharts animations are tuned per-chart, not globally:
   - **Category Mix bars**: `animationDuration={700}`, `animationEasing="ease-out"`, staggered `animationBegin` of `0/150/300`ms across Bridal/Diamond/Gold series. Keep it snappy — never above 1s.
   - **Other Recharts charts**: 600–900ms, `ease-out`. Anything longer feels broken.
4. Never animate color or background of cards on mount — only opacity + small Y translate.

### 6.3 Chart-specific tweaks
- **Product View (hero polyline)**: rendered as raw SVG, animated with `.animate-draw` for the line and `.animate-pop-in` (staggered) for each data point. Container must have real height — give the card `min-h-[280px]` and the inner SVG `h-full w-full` so it doesn't collapse to a thin strip with white space below it.
- **Category Mix**: Recharts BarChart, three series, fast (≤700ms) staggered entrance.
- All charts: wrap in `<ResponsiveContainer>` and ensure parent has `min-w-0 overflow-hidden` to prevent layout blowout in the bento grid.

### 6.4 Troubleshooting
- **`Dev server returned 500 for GET /src/styles.css`** → a remote `@import` (e.g. Google Fonts) snuck back into `src/styles.css`. Move it to a `<link>` in `__root.tsx` and restart the dev server to clear Vite's transform cache.
- **SSR rendering failed / blank screen** → check `src/styles.css` first; Lightning CSS errors surface as SSR failures because the stylesheet is loaded via `?url` in the root route's `links`.
- **Chart shrinks to a strip with empty space below** → the parent card is missing a fixed/min height. Give the card `min-h-[280px]` (or appropriate) and the chart wrapper `h-full`.

---

## Section 7 — Dashboard Source Snapshot (v3.0)

Full current source for the 6 files that define the dashboard. Drop these back at their original paths to reproduce the current build exactly.

| Snippet | Original path |
|---|---|
| 7.1 | `src/styles.css` |
| 7.2 | `src/routes/__root.tsx` |
| 7.3 | `src/routes/index.tsx` |
| 7.4 | `src/components/dashboard/Bento.tsx` |
| 7.5 | `src/components/dashboard/Topbar.tsx` |
| 7.6 | `src/components/dashboard/Sidebar.tsx` |

### 7.1 `src/styles.css`

```css

@import "tailwindcss" source(none);
@import "tw-animate-css";
@source "../src";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

@custom-variant dark (&:is(.dark *));

@theme inline {
  --radius-sm: calc(var(--radius) - 6px);
  --radius-md: calc(var(--radius) - 4px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
  --radius-3xl: calc(var(--radius) + 16px);
  --radius-4xl: calc(var(--radius) + 24px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary-glow: var(--primary-glow);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-ring-offset-background: var(--background);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

:root {
  --radius: 1rem;
  /* Warm off-white canvas */
  --background: oklch(0.965 0.005 90);
  --foreground: oklch(0.18 0.005 90);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.18 0.005 90);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.18 0.005 90);

  /* Primary = near-black (used for solid CTA) */
  --primary: oklch(0.18 0.005 90);
  --primary-foreground: oklch(0.99 0 0);
  --primary-glow: oklch(0.35 0.005 90);

  --secondary: oklch(0.945 0.005 90);
  --secondary-foreground: oklch(0.22 0.005 90);
  --muted: oklch(0.955 0.005 90);
  --muted-foreground: oklch(0.52 0.008 80);
  --accent: oklch(0.94 0.005 90);
  --accent-foreground: oklch(0.18 0.005 90);
  --destructive: oklch(0.62 0.22 22);
  --destructive-foreground: oklch(0.99 0 0);
  --border: oklch(0.91 0.006 85);
  --input: oklch(0.91 0.006 85);
  --ring: oklch(0.6 0.16 145);

  /* Charts: green-led palette (accent positive) + neutral grays */
  --chart-1: oklch(0.68 0.17 145);
  --chart-2: oklch(0.55 0.005 90);
  --chart-3: oklch(0.78 0.005 90);
  --chart-4: oklch(0.7 0.16 50);
  --chart-5: oklch(0.62 0.22 22);

  --sidebar: oklch(0.965 0.005 90);
  --sidebar-foreground: oklch(0.18 0.005 90);
  --sidebar-primary: oklch(0.18 0.005 90);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --sidebar-accent: oklch(0.93 0.005 90);
  --sidebar-accent-foreground: oklch(0.18 0.005 90);
  --sidebar-border: oklch(0.91 0.006 85);
  --sidebar-ring: oklch(0.6 0.16 145);

  --shadow-card: 0 1px 2px rgba(20, 20, 18, 0.04);
  --shadow-pop: 0 8px 24px -12px rgba(20, 20, 18, 0.12);
}

.dark {
  --background: oklch(0.18 0.005 90);
  --foreground: oklch(0.97 0.002 90);
  --card: oklch(0.22 0.005 90);
  --card-foreground: oklch(0.97 0.002 90);
  --popover: oklch(0.22 0.005 90);
  --popover-foreground: oklch(0.97 0.002 90);
  --primary: oklch(0.97 0.002 90);
  --primary-foreground: oklch(0.18 0.005 90);
  --primary-glow: oklch(0.85 0.002 90);
  --secondary: oklch(0.26 0.005 90);
  --secondary-foreground: oklch(0.97 0.002 90);
  --muted: oklch(0.26 0.005 90);
  --muted-foreground: oklch(0.7 0.005 90);
  --accent: oklch(0.3 0.005 90);
  --accent-foreground: oklch(0.97 0.002 90);
  --destructive: oklch(0.68 0.2 22);
  --destructive-foreground: oklch(0.97 0.002 90);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.68 0.16 145);
  --chart-1: oklch(0.72 0.18 145);
  --chart-2: oklch(0.85 0.005 90);
  --chart-3: oklch(0.6 0.005 90);
  --chart-4: oklch(0.75 0.16 50);
  --chart-5: oklch(0.7 0.2 22);
  --sidebar: oklch(0.22 0.005 90);
  --sidebar-foreground: oklch(0.97 0.002 90);
  --sidebar-primary: oklch(0.97 0.002 90);
  --sidebar-primary-foreground: oklch(0.18 0.005 90);
  --sidebar-accent: oklch(0.3 0.005 90);
  --sidebar-accent-foreground: oklch(0.97 0.002 90);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.68 0.16 145);
}

@layer base {
  * {
    border-color: var(--color-border);
  }
  body {
    background-color: var(--color-background);
    color: var(--color-foreground);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "cv11", "ss01";
  }
  .font-display {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .font-mono { font-family: var(--font-mono); }
}

@layer utilities {
  .shadow-card { box-shadow: var(--shadow-card); }
  .shadow-pop { box-shadow: var(--shadow-pop); }

  .surface-card {
    background: var(--card);
    border-radius: 1.25rem;
    border: 1px solid var(--border);
    box-shadow: var(--shadow-card);
  }

  @keyframes float-up {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-float-up {
    animation: float-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes grow-width {
    from { width: 0; }
  }
  .animate-grow-width {
    animation: grow-width 1s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes draw-line {
    from { stroke-dashoffset: 2000; }
    to   { stroke-dashoffset: 0; }
  }
  .animate-draw {
    stroke-dasharray: 2000;
    animation: draw-line 2.8s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes fade-rise {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-rise {
    animation: fade-rise 1.4s cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes pop-in {
    from { opacity: 0; transform: scale(0.2); }
    to   { opacity: 1; transform: scale(1); }
  }
  .animate-pop-in {
    transform-box: fill-box;
    transform-origin: center;
    animation: pop-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
}
```

### 7.2 `src/routes/__root.tsx`

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Sidebar } from "@/components/dashboard/Sidebar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DV Jewelry Corp · Distribution Hub" },
      { name: "description", content: "DV Jewelry Corp inventory, replenishment and sales analytics dashboard." },
      { name: "author", content: "DV Jewelry Corp" },
      { property: "og:title", content: "DV Jewelry Corp · Distribution Hub" },
      { property: "og:description", content: "Inventory, replenishment and sales analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <Outlet />
        </div>
      </div>
    </QueryClientProvider>
  );
}
```

### 7.3 `src/routes/index.tsx`

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { Topbar } from "@/components/dashboard/Topbar";
import {
  KpiBubbles, RevenueClay, CategoryComposition,
  SalesVsForecast, MemoStatus,
  TopClientsClay, TopSellingStyles, RestockClay, LivePulse, ActivitySummary,
} from "@/components/dashboard/Bento";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <main className="flex-1 min-w-0 px-6 py-5 lg:px-8 lg:py-6 animate-float-up">
      <Topbar />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <RevenueClay />
          <KpiBubbles />
          <CategoryComposition />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TopClientsClay />
            <RestockClay />
          </div>
          <SalesVsForecast />
        </div>

        <div className="space-y-4 min-w-0">
          <TopSellingStyles />
          <ActivitySummary />
          <LivePulse />
          <MemoStatus />
        </div>
      </div>

      <footer className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold pt-5 mt-2">
        <span>DV Jewelry Corp</span>
        <span>Central Ledger · v3.0 · FY 2026</span>
      </footer>
    </main>
  );
}
```

### 7.4 `src/components/dashboard/Bento.tsx`

```tsx
import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight, ArrowUpRight, ArrowDownRight, Package, UserPlus, RefreshCw, ShoppingBag, RotateCcw, MoreHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- shared bits ---------- */
type DashboardCardProps = { className?: string };

const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={cn("surface-card p-4 lg:p-5 overflow-hidden", className)}>{children}</div>
);

const SectionLabel = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-[15px] font-semibold tracking-tight">{children}</h3>
    {action}
  </div>
);

const RangePill = ({ label = "Last month" }: { label?: string }) => (
  <button className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-secondary text-[11px] font-medium text-foreground hover:bg-accent transition-colors">
    {label}
    <ChevronDown className="w-3 h-3" />
  </button>
);

const Delta = ({ value, positive }: { value: string; positive: boolean }) => (
  <span className={cn(
    "inline-flex items-center gap-0.5 text-[11px] font-semibold",
    positive ? "text-emerald-600" : "text-red-500"
  )}>
    {positive ? <ArrowUpRight className="w-3 h-3" strokeWidth={2.5} /> : <ArrowDownRight className="w-3 h-3" strokeWidth={2.5} />}
    {value}
  </span>
);

/* ============= OVERVIEW (KPI BUBBLES) ============= */
const kpis = [
  { label: "Total Sales",  value: "$5.82M",  delta: "+10.0%", sub: "vs FY25",       positive: true,  icon: TrendingUp },
  { label: "Net Profit",   value: "$1.24M",  delta: "+4.2%",  sub: "21.3% margin",  positive: true,  icon: TrendingUp },
  { label: "This Month",   value: "$141K",   delta: "−9.0%",  sub: "Below pace",    positive: false, icon: TrendingDown },
  { label: "Active Memos", value: "237",     delta: "+12",    sub: "8 overdue",     positive: true,  icon: Package },
];

export function KpiBubbles({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Overview</h3>
        <RangePill label="Last month" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              className="p-3 rounded-2xl bg-secondary/45 animate-float-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground min-w-0">
                  <Icon className="w-3.5 h-3.5" strokeWidth={2.2} />
                  <span className="truncate">{k.label}</span>
                </div>
                <Delta value={k.delta} positive={k.positive} />
              </div>
              <div className="text-[24px] font-bold tracking-tight leading-none tabular-nums">{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-2">{k.sub}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ============= REVENUE (Area, hero) ============= */
const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const salesData = months.map((m, i) => ({
  m,
  actual:   320 + Math.round(Math.sin(i / 1.6) * 90) + i * 18,
  forecast: 340 + Math.round(Math.cos(i / 2)   * 60) + i * 16,
}));

const heroPoints = salesData.map((d, i) => {
  const x = 18 + (i / (salesData.length - 1)) * 784;
  const y = 160 - ((d.actual - 260) / 370) * 122;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

const heroForecastPoints = salesData.map((d, i) => {
  const x = 18 + (i / (salesData.length - 1)) * 784;
  const y = 160 - ((d.forecast - 260) / 370) * 122;
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

const heroFill = `18,170 ${heroPoints} 802,170`;

export function RevenueClay({ className }: DashboardCardProps = {}) {
  const [range, setRange] = useState<"12M" | "6M" | "3M">("12M");
  const sliced = range === "12M" ? salesData : range === "6M" ? salesData.slice(-6) : salesData.slice(-3);
  const peak = sliced.reduce((a, b) => (b.actual > a.actual ? b : a), sliced[0]);

  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex justify-between items-start mb-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Product view</div>
          <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <span className="text-[42px] font-bold tracking-tight leading-none tabular-nums">${(sliced.reduce((s, d) => s + d.actual, 0) / 100).toFixed(1)}K</span>
            <Delta value="+12.4%" positive />
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">Actual sales against forecast across the active ledger.</p>
        </div>
        <div className="bg-secondary p-0.5 rounded-full flex gap-0.5">
          {(["3M","6M","12M"] as const).map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn(
                "px-3 h-7 text-[11px] font-semibold rounded-full transition-all",
                range === r ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] lg:h-[320px] -mx-1 mt-3 min-h-0">
        <svg viewBox="0 0 820 190" preserveAspectRatio="xMidYMid meet" className="h-full w-full overflow-visible" role="img" aria-label="Revenue trend chart">
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[44, 86, 128, 170].map((y) => (
            <line key={y} x1="18" x2="802" y1={y} y2={y} stroke="#ECEAE4" strokeWidth="1" strokeDasharray="4 5" />
          ))}
          <polygon points={heroFill} fill="url(#actualGrad)" className="animate-fade-rise" style={{ animationDelay: "300ms" }} />
          <polyline points={heroForecastPoints} fill="none" stroke="#a3a39b" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" style={{ animationDelay: "200ms" }} />
          <polyline points={heroPoints} fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" />
          {salesData.map((d, i) => {
            const x = 18 + (i / (salesData.length - 1)) * 784;
            const y = 160 - ((d.actual - 260) / 370) * 122;
            return <circle key={d.m} cx={x} cy={y} r={i === salesData.length - 1 ? 5 : 3.5} fill="#16a34a" stroke="white" strokeWidth="2" className="animate-pop-in" style={{ animationDelay: `${600 + i * 60}ms` }} />;
          })}
          {months.map((m, i) => i % 2 === 0 && (
            <text key={m} x={18 + (i / (months.length - 1)) * 784} y="188" textAnchor="middle" fill="#8f8c84" fontSize="11" fontWeight="600">{m}</text>
          ))}
        </svg>
      </div>


      <div className="flex items-center gap-5 mt-3 text-[11px] text-muted-foreground font-medium">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-600" /> Actual</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-neutral-400" /> Forecast</span>
        <span className="ml-auto">Peak · {peak.m} · ${peak.actual}K</span>
      </div>
    </Card>
  );
}

/* ============= CATEGORY COMPOSITION (Stacked bars) ============= */
const composition = months.map((m, i) => {
  const seed = (i + 1) * 7;
  return {
    m,
    Bridal:  40 + (seed * 3) % 40,
    Diamond: 30 + (seed * 5) % 35,
    Gold:    18 + (seed * 2) % 22,
  };
});

export function CategoryComposition({ className }: DashboardCardProps = {}) {
  const [mode, setMode] = useState<"stack" | "group">("stack");
  return (
    <Card className={className}>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight">Category mix · 12 months</h3>
        <div className="bg-secondary p-0.5 rounded-full flex gap-0.5">
          {(["stack","group"] as const).map(r => (
            <button key={r} onClick={() => setMode(r)}
              className={cn(
                "px-3 h-7 text-[11px] font-semibold rounded-full capitalize transition-all",
                mode === r ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[240px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={composition} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} barCategoryGap={mode === "stack" ? "22%" : "14%"}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ECEAE4" vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false}
              tick={{ fontSize: 11, fill: "#9a9a93", fontWeight: 500 }} dy={8} />
            <YAxis tickLine={false} axisLine={false}
              tick={{ fontSize: 11, fill: "#9a9a93" }} width={36} />
            <Tooltip cursor={{ fill: "#F5F4F0", radius: 8 }}
              contentStyle={{ borderRadius: 12, border: "1px solid #ECEAE4", fontSize: 12, fontWeight: 500,
                background: "white", boxShadow: "0 8px 24px -12px rgba(20,20,18,0.12)" }} />
            <Bar isAnimationActive animationDuration={700} animationBegin={0}   animationEasing="ease-out" dataKey="Bridal"  stackId={mode === "stack" ? "a" : undefined} fill="#0a0a0a"  radius={[6,6,0,0]} />
            <Bar isAnimationActive animationDuration={700} animationBegin={150} animationEasing="ease-out" dataKey="Diamond" stackId={mode === "stack" ? "a" : undefined} fill="#16a34a"  radius={mode === "stack" ? [0,0,0,0] : [6,6,0,0]} />
            <Bar isAnimationActive animationDuration={700} animationBegin={300} animationEasing="ease-out" dataKey="Gold"    stackId={mode === "stack" ? "a" : undefined} fill="#d4d4d0" radius={mode === "stack" ? [6,6,0,0] : [6,6,0,0]} />

          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-5 mt-2 text-[11px] text-muted-foreground font-medium">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-foreground" /> Bridal</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-600" /> Diamond</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-neutral-300" /> Gold</span>
      </div>
    </Card>
  );
}

/* ============= SALES vs FORECAST (Radar) ============= */
const radarData = [
  { cat: "Bridal",     actual: 95, forecast: 80 },
  { cat: "Earrings",   actual: 72, forecast: 75 },
  { cat: "Necklaces",  actual: 60, forecast: 70 },
  { cat: "Bracelets",  actual: 78, forecast: 65 },
  { cat: "Rings",      actual: 88, forecast: 82 },
  { cat: "Pendants",   actual: 55, forecast: 68 },
];

export function SalesVsForecast({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel>Sales vs Forecast</SectionLabel>
      <div className="h-[240px] -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={radarData} outerRadius="78%">
            <PolarGrid stroke="#ECEAE4" />
            <PolarAngleAxis dataKey="cat" tick={{ fontSize: 10, fill: "#52524a", fontWeight: 600 }} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAE4", fontSize: 12, fontWeight: 500,
              background: "white", boxShadow: "0 8px 24px -12px rgba(20,20,18,0.12)" }} />
            <Radar name="Forecast" dataKey="forecast" stroke="#a3a39b" strokeWidth={1.5} strokeDasharray="4 4"
              fill="#a3a39b" fillOpacity={0.08} />
            <Radar name="Actual" dataKey="actual" stroke="#16a34a" strokeWidth={2}
              fill="#16a34a" fillOpacity={0.18} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-medium">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-emerald-600" /> Actual</span>
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-neutral-400" /> Forecast</span>
      </div>
    </Card>
  );
}

/* ============= MEMO STATUS (Donut) ============= */
const memoData = [
  { name: "Active",    value: 142, fill: "#0a0a0a" },
  { name: "Returning", value:  64, fill: "#16a34a" },
  { name: "Expiring",  value:  23, fill: "#f59e0b" },
  { name: "Overdue",   value:   8, fill: "#ef4444" },
];

export function MemoStatus({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel>Memo status</SectionLabel>
      <div className="flex flex-col items-center gap-3">
        <div className="relative h-[160px] w-[160px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={memoData} dataKey="value" innerRadius={52} outerRadius={74}
                paddingAngle={3} cornerRadius={4} stroke="none">
                {memoData.map((m, i) => <Cell key={i} fill={m.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #ECEAE4", fontSize: 12, fontWeight: 500,
                background: "white", boxShadow: "0 8px 24px -12px rgba(20,20,18,0.12)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[24px] font-bold tabular-nums leading-none">237</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Memos</span>
          </div>
        </div>

        <div className="w-full space-y-1">
          {memoData.map(m => (
            <div key={m.name} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary transition cursor-pointer">
              <span className="size-2 rounded-full" style={{ background: m.fill }} />
              <span className="flex-1 text-[12px] font-medium text-foreground truncate">{m.name}</span>
              <span className="tabular-nums text-[12px] font-semibold">{m.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ============= TOP CLIENTS ============= */
const clients = [
  { name: "Van Cleef & Arpels", tier: "Maison · Paris",      revenue: 482, growth: "+22%", positive: true },
  { name: "Bulgari",            tier: "Maison · Roma",       revenue: 391, growth: "+8%",  positive: true },
  { name: "Tiffany & Co.",      tier: "Flagship · NYC",      revenue: 348, growth: "−3%",  positive: false },
  { name: "Cartier",            tier: "Maison · Paris",      revenue: 312, growth: "+15%", positive: true },
  { name: "Chopard",            tier: "Atelier · Geneva",    revenue: 264, growth: "+6%",  positive: true },
  { name: "Boucheron",          tier: "Maison · Paris",      revenue: 218, growth: "+11%", positive: true },
];
const maxRev = Math.max(...clients.map(c => c.revenue));

export function TopClientsClay({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel action={<RangePill label="USD · 000s" />}>Top clients</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
        {clients.map((c, i) => {
          const w = (c.revenue / maxRev) * 100;
          const initials = c.name.split(" ").filter(s => s[0] && /[A-Z]/.test(s[0])).slice(0, 2).map(s => s[0]).join("");
          return (
            <div key={c.name}
              className="group flex items-center gap-3 p-2 rounded-xl hover:bg-secondary transition cursor-pointer">
              <div className="size-9 rounded-full bg-secondary text-foreground flex items-center justify-center font-semibold text-[11px] shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] text-foreground truncate">{c.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{c.tier}</div>
                <div className="h-1 mt-1 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-foreground rounded-full animate-grow-width"
                    style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular-nums text-[13px]">${c.revenue}K</div>
                <Delta value={c.growth} positive={c.positive} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ============= POPULAR PRODUCTS (right column) ============= */
const topStyles = [
  { name: "Solitaire 1.2ct",  cat: "Bridal · Platinum",  rev: 4200, tone: "bg-foreground", status: "Active" },
  { name: "Halo Brilliant",   cat: "Engagement · WG",    rev: 3100, tone: "bg-amber-500", status: "Active" },
  { name: "Pavé Eternity",    cat: "Wedding · Rose Gold", rev: 2400, tone: "bg-emerald-600", status: "Active" },
  { name: "3-Stone Classic",  cat: "Anniversary · YG",   rev: 1900, tone: "bg-neutral-400", status: "Offline" },
  { name: "Eternity Band",    cat: "Wedding · Platinum", rev: 1500, tone: "bg-red-500", status: "Active" },
];

export function TopSellingStyles({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel action={<button className="text-[11px] font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">View all <ArrowRight className="w-3 h-3" /></button>}>
        Popular products
      </SectionLabel>
      <div className="space-y-1">
        {topStyles.map(s => {
          const active = s.status === "Active";
          return (
            <div key={s.name} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-secondary transition cursor-pointer">
              <div className="size-11 rounded-full bg-secondary shrink-0 p-1.5">
                <div className={cn("h-full w-full rounded-full opacity-90", s.tone)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13px] text-foreground truncate">{s.name}</div>
                <div className="text-[11px] text-muted-foreground truncate">{s.cat}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular-nums text-[13px]">${s.rev.toLocaleString()}</div>
                <span className={cn(
                  "inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium",
                  active ? "text-emerald-600" : "text-muted-foreground"
                )}>
                  <span className={cn("size-1.5 rounded-full", active ? "bg-emerald-500" : "bg-neutral-400")} />
                  {s.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <button className="mt-3 w-full h-9 rounded-full border border-border text-[12px] font-semibold hover:bg-secondary transition-colors">
        All products
      </button>
    </Card>
  );
}

/* ============= RESTOCK WATCHLIST ============= */
const restock = [
  { sku: "SOL-1.2-PT", name: "Solitaire 1.20ct", meta: "Platinum",    stock:  3, par: 12, status: "Critical" },
  { sku: "TEN-5.0-PT", name: "Tennis 5.0ct",     meta: "Platinum",    stock:  4, par: 10, status: "Critical" },
  { sku: "HAL-0.8-WG", name: "Halo 0.80ct",      meta: "White Gold",  stock:  6, par: 18, status: "Low" },
  { sku: "ETN-3.0-YG", name: "Eternity 3.0ct",   meta: "Yellow Gold", stock:  9, par: 20, status: "Low" },
  { sku: "PAV-1.5-RG", name: "Pavé 1.50ct",      meta: "Rose Gold",   stock: 11, par: 15, status: "Watch" },
];

export function RestockClay({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel action={<span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600"><span className="size-1.5 rounded-full bg-red-500" />23 items</span>}>
        Restock watchlist
      </SectionLabel>
      <div className="space-y-1">
        {restock.map(r => {
          const ratio = r.stock / r.par;
          const tone = r.status === "Critical"
            ? { dot: "bg-red-500",    text: "text-red-600",     bar: "bg-red-500" }
            : r.status === "Low"
              ? { dot: "bg-amber-500", text: "text-amber-600",  bar: "bg-amber-500" }
              : { dot: "bg-emerald-500", text: "text-emerald-600", bar: "bg-emerald-500" };
          return (
            <div key={r.sku} className="flex items-center gap-3 p-2 rounded-xl hover:bg-secondary transition cursor-pointer">
              <div className="size-9 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <Package className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-[13px] text-foreground truncate">{r.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{r.sku}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{r.meta}</div>
                <div className="h-1 mt-1 bg-secondary rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full animate-grow-width", tone.bar)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0 w-16">
                <div className="font-semibold tabular-nums text-[13px]">{r.stock}<span className="text-muted-foreground">/{r.par}</span></div>
                <span className={cn("inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold", tone.text)}>
                  <span className={cn("size-1.5 rounded-full", tone.dot)} />
                  {r.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function ActivitySummary({ className }: DashboardCardProps = {}) {
  return (
    <div className={cn("rounded-[1.25rem] bg-primary text-primary-foreground border border-primary p-5 shadow-card overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/60">Today</div>
          <div className="mt-2 text-[34px] font-bold tracking-tight leading-none tabular-nums">$184K</div>
          <div className="mt-2 text-[12px] text-primary-foreground/60">Confirmed replenishment pipeline</div>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-primary-foreground px-3 text-[11px] font-bold text-primary">+18%</span>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[
          ["Orders", "42"],
          ["Units", "318"],
          ["Risk", "7"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-primary-foreground/10 px-3 py-2">
            <div className="text-[18px] font-bold tabular-nums">{value}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/55">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============= LIVE PULSE (Comments-style) ============= */
const pulse = [
  { tag: "Return",  icon: RotateCcw,   text: "Memo #4821 returned by Tiffany & Co.",  time: "2m" },
  { tag: "Stock",   icon: Package,     text: "Solitaire 1.2ct restocked × 12",        time: "14m" },
  { tag: "Client",  icon: UserPlus,    text: "New client onboarded — Boucheron",      time: "1h" },
  { tag: "Sync",    icon: RefreshCw,   text: "Excel sync completed — 1,240 lines",    time: "3h" },
  { tag: "Order",   icon: ShoppingBag, text: "Bulgari placed reorder $84,200",        time: "5h" },
];

export function LivePulse({ className }: DashboardCardProps = {}) {
  return (
    <Card className={className}>
      <SectionLabel action={
        <button className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-4 h-4" /></button>
      }>Activity</SectionLabel>
      <div className="space-y-1">
        {pulse.map((p, i) => {
          const Icon = p.icon;
          return (
            <div key={i} className="flex items-start gap-3 p-2 rounded-xl hover:bg-secondary transition cursor-pointer">
              <div className="size-9 rounded-full bg-secondary flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[12px] font-semibold text-foreground">{p.tag}</span>
                  <span className="text-[10px] text-muted-foreground">{p.time} ago</span>
                </div>
                <div className="text-[12px] text-muted-foreground leading-snug">{p.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
```

### 7.5 `src/components/dashboard/Topbar.tsx`

```tsx
import { Search, Bell, MessageCircle } from "lucide-react";

export function Topbar() {
  return (
    <header className="flex items-center gap-3 mb-6">
      <h1 className="text-[22px] font-bold tracking-tight">Dashboard</h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="flex items-center gap-2 w-[380px] h-10 px-4 rounded-full bg-card border border-border focus-within:border-foreground/30 transition-colors">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2.2} />
          <input
            type="text"
            placeholder="Search clients, memos, SKUs…"
            className="flex-1 min-w-0 bg-transparent outline-none text-[13px] placeholder:text-muted-foreground"
          />
        </div>
        <button className="h-10 px-5 rounded-full bg-foreground text-background text-[13px] font-semibold hover:bg-foreground/90 transition-colors">
          Create
        </button>
        <button aria-label="Messages" className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors">
          <MessageCircle className="w-4 h-4" strokeWidth={2.2} />
        </button>
        <button aria-label="Notifications" className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center hover:bg-secondary transition-colors relative">
          <Bell className="w-4 h-4" strokeWidth={2.2} />
          <span className="absolute top-2 right-2 size-1.5 rounded-full bg-red-500" />
        </button>
        <button className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center text-[11px] font-bold">
          KD
        </button>
      </div>
    </header>
  );
}
```

### 7.6 `src/components/dashboard/Sidebar.tsx`

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutGrid, Package, Users, FileSpreadsheet, RefreshCw,
  MessageCircle, Moon, Gem,
} from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutGrid },
  { to: "/replenishment/stock", label: "Stock Replenishment", icon: Package },
  { to: "/replenishment/client", label: "Client Replenishment", icon: RefreshCw },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/excel-config", label: "Excel Config", icon: FileSpreadsheet },
];

export function Sidebar() {
  const location = useLocation();
  const isActive = (p: string) => location.pathname === p;

  return (
    <aside className="hidden lg:flex w-[220px] shrink-0 sticky top-0 self-start h-screen z-40 flex-col py-5 px-3 bg-sidebar border-r border-border border-white border-0 border-none">
      {/* Brand */}
      <Link to="/" className="flex items-center gap-2.5 px-3 py-2 mb-6" aria-label="DV Ledger home">
        <div className="w-8 h-8 rounded-full bg-foreground flex items-center justify-center text-background">
          <Gem className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <span className="font-bold text-[15px] tracking-tight">DV Ledger</span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5">
        {items.map((it) => {
          const active = isActive(it.to);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              <Icon className="w-[17px] h-[17px]" strokeWidth={2} />
              <span className="truncate">{it.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom utility */}
      <div className="flex flex-col gap-1 pt-3 border-t border-border">
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors">
          <MessageCircle className="w-[17px] h-[17px]" strokeWidth={2} />
          <span>Support</span>
        </button>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground transition-colors">
          <Moon className="w-[17px] h-[17px]" strokeWidth={2} />
          <span>Theme</span>
        </button>
      </div>
    </aside>
  );
}
```
