export const LOGIN_TOKENS = {
  color: {
    obsidian: "#020617",
    platinum: "#E2E8F0",
    diamond: "#7DD3FC",
    gold: "#D4AF37",
    textPrimary: "#F8FAFC",
    textMuted: "#CBD5E1",
    borderGlass: "rgba(226,232,240,0.22)",
    panelGlass: "rgba(15,23,42,0.42)",
  },
  spacing: {
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48,
  },
  radius: {
    card: "1.75rem",
    control: "0.875rem",
  },
  typography: {
    display: "clamp(2rem, 3.2vw, 3rem)",
    title: "clamp(1.75rem, 2.4vw, 2.5rem)",
    body: "0.95rem",
    caption: "0.75rem",
  },
  motion: {
    durationFast: 0.18,
    durationBase: 0.32,
    easeStandard: [0.22, 1, 0.36, 1] as const,
    easeSoft: [0.16, 1, 0.3, 1] as const,
  },
} as const;

