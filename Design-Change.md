# DVJ ERP — Sidebar + Navbar Lovable Prompt V3
# Reference aesthetic layout + DVJ ERP color system

## Design Goal
Replicate the LAYOUT and STRUCTURE from the reference images exactly.
The tree sidebar, floating active card, bottom utility icons, large page title, clean navbar.
BUT apply the DVJ ERP color system — NOT the reference image colors.

---

## DVJ ERP Color System (use these EXACTLY — no greys from reference)

```css
:root {
  /* Page & surfaces */
  --bg-page:          #FAF8F5;   /* warm ivory — page background */
  --bg-sidebar:       #F0EDE8;   /* warm beige — sidebar background */
  --bg-card:          #FFFFFF;   /* white — cards, dropdowns, modals */
  --bg-input:         #F0EDE8;   /* warm beige — input fields */
  --bg-hover:         #E8E3DC;   /* slightly darker beige — hover states */

  /* Primary — Dark Plum */
  --primary:          #3B0764;   /* dark plum — buttons, active, accent */
  --primary-hover:    #4C0C82;   /* slightly lighter on hover */
  --primary-light:    #EDE9FE;   /* lavender tint — active item bg */
  --primary-text:     #3B0764;   /* text on primary-light bg */

  /* Text */
  --text-primary:     #1C1917;   /* near black warm */
  --text-secondary:   #57534E;   /* warm medium grey */
  --text-muted:       #A8A29E;   /* warm light grey */
  --text-placeholder: #C4B5A8;   /* very muted warm */

  /* Borders */
  --border:           #E8E3DC;   /* warm beige border */
  --border-subtle:    #F0EDE8;   /* very subtle border */

  /* Semantic */
  --success:          #16A34A;
  --success-bg:       #DCFCE7;
  --warning:          #D97706;
  --warning-bg:       #FEF3C7;
  --error:            #DC2626;
  --error-bg:         #FEE2E2;
  --info:             #2563EB;
  --info-bg:          #DBEAFE;
}
```

---

## Typography

```
Primary UI font:  Plus Jakarta Sans — import from Google Fonts
Data/mono font:   JetBrains Mono — import from Google Fonts (table cells only)

Title (page):     26px / 700 / #1C1917 / letter-spacing -0.02em
Heading:          16px / 600 / #1C1917
Body:             14px / 400 / #57534E
Label/caption:    11px / 500 / #A8A29E
Tiny:             9px  / 600 / uppercase / letter-spacing 0.07em
```

---

## Page Shell Layout

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR (#F0EDE8 beige, 220px)  │  PAGE (#FAF8F5 ivory) │
│                                  │                        │
│  [nav tree with plum accents]    │  [navbar — no bg]      │
│                                  │  [content cards white] │
│  [bottom utility icons]          │                        │
│  [user footer]                   │                        │
└──────────────────────────────────────────────────────────┘
```

---

## Sidebar

### Container
- Background: #F0EDE8 (warm beige — NOT white like reference)
- Width expanded: 220px
- Width collapsed: 60px
- Right edge: no hard border — just subtle shadow: box-shadow 2px 0 12px rgba(28,25,23,0.06)
- Padding: 20px 12px

### Logo / header area
- Logo mark: 34×34px square, background #3B0764 (dark plum), border-radius 8px
- Inside logo: white letter "D" or white diamond/gem SVG shape, font-size 16px font-weight 700
- Next to logo: "DVJ ERP" — 14px, font-weight 700, color #1C1917
- Collapse toggle: small ChevronLeft icon, 16px, color #A8A29E, far right of header
- On collapse: hide text, hide group labels, show icons only, animate 200ms

### Navigation — TREE STRUCTURE (critical, must match reference exactly)

**Structure:**
```
Dashboard         (LayoutDashboard icon)    ← standalone, greyed "soon"

↓ Replenishment   (RefreshCw icon)          ← expanded group
    ├── Client                              ← ACTIVE
    ├── History
    └── Stock Replenishment                 ← "soon" badge

→ Master Data     (Database icon)           ← collapsed group
→ Administration  (Settings2 icon)          ← collapsed group
```

**Tree connector lines — exactly like reference:**
- When group is expanded: vertical line 1px solid #E8E3DC runs down the left side connecting all sub-items
- Sub-items indented 24px from parent left edge
- Horizontal tick: 8px horizontal line from vertical line to sub-item text
- Sub-items: text only, no icons
- Line color: #C4B5A8 (warm muted — matches our beige system)

**Parent item (top level) styles:**
- Default: icon #78716C + text #78716C, no background
- Hover: background #E8E3DC, border-radius 8px, transition 120ms
- Expanded: icon #3B0764, text #1C1917 font-weight 600, chevron rotated 180°
- Collapsed: chevron at 0°

**Sub-item styles:**
- Default: text #78716C, font-size 13px
- Hover: text #1C1917, background transparent (just text color change)
- ACTIVE: white floating card — background #FFFFFF, border-radius 8px, box-shadow 0 2px 8px rgba(28,25,23,0.10), text #3B0764 font-weight 600, font-size 13px
  — The white card sits ON the beige sidebar — this contrast is the active indicator
  — Add a 2px left border: border-left 2px solid #3B0764 on the active card

**Accordion behavior:**
- Click parent to expand/collapse sub-items
- Height transition: 200ms ease
- Only one group open at a time (optional)
- Expanded state stores in localStorage

**Coming soon items:**
- Text color: #C4B5A8
- No hover effect, cursor default
- Badge: "soon" — background #E8E3DC, color #A8A29E, font-size 9px, border-radius 99px, padding 1px 7px, margin-left auto

### Bottom utility icons (pinned to bottom, above user footer — exactly like reference)
3 icons stacked vertically, left-aligned:
```
MessageCircle   (future: internal messaging)
Moon            (future: dark mode)
Settings        (→ /settings)
```
- Each container: 36×36px, border-radius 8px
- Icon: 18px, color #A8A29E
- Hover: background #E8E3DC, icon color #3B0764
- Active (Settings when on /settings): background #EDE9FE, icon color #3B0764

### User footer (very bottom, pinned)
- Top border: 0.5px solid #E8E3DC
- Padding: 12px 4px 4px
- Avatar: 28px circle, background #3B0764, initials "KD", font-size 10px font-weight 700, color #FFFFFF
- Name: "Karan Davda" — 11px, font-weight 600, color #1C1917
- Role: "Super Admin" — 9px, color #A8A29E
- On hover: show three-dot menu icon (MoreHorizontal) on right
- Three-dot menu → dropdown: Profile, Sign out

---

## Top Navbar

### Style
- Background: TRANSPARENT — floats on #FAF8F5 page background (no white bar)
- Height: 56px
- Padding: 0 28px
- Display: flex, align-items center, justify-content space-between

### Left — Page title (large, dominant — exactly like reference)
```
Replenishment
```
- Font-size: 26px
- Font-weight: 700
- Color: #1C1917
- Letter-spacing: -0.02em
- NO breadcrumb, NO subtitle, NO icon — just the big title

### Right side — 5 elements

**1. Search pill**
- Background: #FFFFFF
- Border: 0.5px solid #E8E3DC
- Border-radius: 99px
- Padding: 7px 14px
- Width: 190px
- Left: Search icon 14px color #A8A29E
- Text: "Search anything..." 12px color #A8A29E
- Right: "⌘K" — 9px, background #F0EDE8, color #A8A29E, border-radius 4px, padding 1px 5px
- Hover: border-color #C4B5A8
- Click: open global search modal

**2. Upload Excel button (primary CTA)**
- Background: #3B0764
- Color: #FFFFFF
- Border-radius: 20px
- Padding: 7px 18px
- Font-size: 13px, font-weight 600
- Hover: background #4C0C82
- Icon: Upload icon 14px on left
- Text: "Upload Excel"
- Click: opens Excel upload type selector modal

**3. Notification bell**
- Icon: Bell, 18px, color #78716C
- Container: 36px circle, background transparent
- Hover: background #E8E3DC, border-radius 50%, icon color #3B0764
- Unread badge: 8px circle, background #DC2626, top-right of icon
- Click: notification dropdown (see below)

**4. Message icon**
- Icon: MessageCircle, 18px, color #78716C
- Same container style as bell
- Future use — shows tooltip "Coming soon" on click

**5. User avatar**
- 34px circle, background #3B0764, initials "KD", font-size 11px font-weight 700, color white
- Hover: box-shadow 0 0 0 3px #EDE9FE
- Click: user dropdown

---

## Notification Dropdown
- Width: 320px, right-aligned below bell
- Background: #FFFFFF
- Border: 0.5px solid #E8E3DC
- Border-radius: 14px
- Box-shadow: 0 8px 24px rgba(28,25,23,0.10)
- Header: "Notifications" 14px 600 #1C1917 + "Mark all read" 11px #3B0764 right side
- Empty state:
  - Bell icon 32px color #E8E3DC centered
  - "No notifications yet" 13px #57534E
  - "Sales alerts will appear here when live data is connected" 11px #A8A29E
- Future notification item:
  - Left dot: 8px circle (green/amber/red)
  - Title: 13px 500 #1C1917
  - Body: 12px #78716C
  - Time: 10px #A8A29E
  - Unread bg: #FAF8F5
  - Read bg: #FFFFFF
- Close: click outside or Escape

---

## User Dropdown
- Width: 248px, right-aligned below avatar
- Background: #FFFFFF
- Border: 0.5px solid #E8E3DC
- Border-radius: 14px
- Box-shadow: 0 8px 24px rgba(28,25,23,0.10)

**Header (non-clickable):**
- Avatar 40px circle #3B0764 + initials
- Name: "Karan Davda" 14px 600 #1C1917
- Email: "karan.davda@renaissancejewel.com" 11px #A8A29E
- Role badge: "Super Admin" — background #EDE9FE, color #3B0764, font-size 10px 600, border-radius 4px, padding 2px 8px

**Divider:** 0.5px solid #E8E3DC

**Menu items:**
- User icon: "Profile" — 13px #1C1917
- Settings icon: "System Settings" — 13px #1C1917
- Keyboard icon: "Keyboard Shortcuts" — 13px #1C1917
- Hover: background #FAF8F5

**Divider:** 0.5px solid #E8E3DC

**Sign out:**
- LogOut icon + "Sign out" — 13px #DC2626
- Hover: background #FEE2E2

---

## Global Search Modal (Cmd+K)
- Overlay: rgba(28,25,23,0.35), backdrop-blur: 4px
- Modal: #FFFFFF, border-radius 16px, width 560px, max-height 480px, centered
- Box-shadow: 0 24px 48px rgba(28,25,23,0.15)
- Search input: 18px, font-weight 500, color #1C1917, no border, padding 20px
- Bottom of input: 0.5px solid #E8E3DC
- Placeholder: "Search clients, stock, invoices..." color #A8A29E
- Left icon: Search 18px #A8A29E

**Recent searches section:**
- Label: "RECENT" — 9px 600 uppercase #A8A29E, padding 8px 20px
- Items: 44px rows, padding 0 20px, hover #FAF8F5
- Left: icon 16px #A8A29E + text 13px #1C1917 + subtext 11px #A8A29E
- Right: ArrowUpLeft icon 14px #E8E3DC

**Categories row:**
- "Search in:" label + pills: Clients · Stock · Invoices · History
- Pills: background #F0EDE8, color #57534E, border-radius 99px, 11px
- Active pill: background #EDE9FE, color #3B0764

**Empty state:**
- Search icon 32px #E8E3DC centered
- "Type to search across clients, stock and invoices" 13px #A8A29E

---

## Main Content Placeholder

- Background: #FAF8F5 (warm ivory)
- Padding: 28px
- Single white card: background #FFFFFF, border 0.5px solid #E8E3DC, border-radius 12px, padding 40px
- Centered inside card:
  - RefreshCw icon 32px color #E8E3DC
  - "Select a client and date range to load replenishment results" 14px #A8A29E
  - margin-top 12px

---

## Animation Timings
- Sidebar collapse: 200ms ease
- Accordion expand: 200ms ease
- Hover backgrounds: 120ms ease
- Dropdown appear: 120ms ease + fade
- Modal appear: 150ms ease + scale 0.96→1.0 + fade
- All other transitions: 150ms ease

---

## Critical Rules (DO NOT violate)

1. Page background: #FAF8F5 warm ivory — NOT grey, NOT white
2. Sidebar background: #F0EDE8 warm beige — NOT white, NOT grey
3. Active nav sub-item: white floating card (#FFFFFF) with box-shadow AND 2px left border #3B0764
4. Tree connector lines: 1px solid #C4B5A8 — vertical line + horizontal tick to sub-items
5. Page title: 26px 700 — large and dominant, NO navbar background behind it
6. Primary color everywhere: #3B0764 dark plum — buttons, active states, avatar, logo
7. NO pure greys — all greys must be warm (use values from color system above)
8. Plus Jakarta Sans for everything except data table cells
9. No gradients, no heavy shadows, no glassmorphism
10. Import both fonts from Google Fonts at top of CSS