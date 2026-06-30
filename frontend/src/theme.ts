// Theme constants for MVG Computación - Professional SaaS palette
export const colors = {
  // Surfaces (light, content area)
  background: "#F5F7FB",
  surface: "#FFFFFF",
  surfaceAlt: "#F8FAFC",
  surfaceElevated: "#FFFFFF",
  surfaceMuted: "#F1F5F9",

  // Brand
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  primarySoft: "#DBEAFE",
  accent: "#F97316", // MVG orange
  accentHover: "#EA580C",
  accentSoft: "#FFEDD5",

  // Text
  textMain: "#0F172A",
  textMuted: "#64748B",
  textDim: "#94A3B8",

  // Borders
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
  borderStrong: "#CBD5E1",

  // Status
  pending: "#D97706",
  pendingSoft: "#FEF3C7",
  inProgress: "#2563EB",
  inProgressSoft: "#DBEAFE",
  completed: "#059669",
  completedSoft: "#D1FAE5",
  highPriority: "#DC2626",
  mediumPriority: "#D97706",
  lowPriority: "#059669",
  danger: "#DC2626",
  dangerSoft: "#FEE2E2",
  warning: "#D97706",
  white: "#FFFFFF",

  // Sidebar (dark for SaaS contrast)
  sidebarBg: "#0F172A",
  sidebarBgAlt: "#1E293B",
  sidebarBorder: "#1E293B",
  sidebarText: "#94A3B8",
  sidebarTextActive: "#FFFFFF",
  sidebarActiveBg: "rgba(255,255,255,0.08)",
  sidebarHover: "rgba(255,255,255,0.04)",

  // Overlay (modals)
  overlay: "rgba(15,23,42,0.55)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 32,
};

export const shadow = {
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  lg: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
};

export const MVG_LOGO_URL =
  "https://customer-assets.emergentagent.com/job_mvg-fieldwork-hub/artifacts/ro1zj8fb_ChatGPT%20Image%201%20jul%202026%2C%2001_44_12.png";

// Nuevo logo MVG (engrane azul + globo + texto MVG verde) — fondo transparente/negro
// Funciona en fondos oscuros sin necesidad de mixBlendMode.
export const MVG_LOGO_LIGHT =
  "https://customer-assets.emergentagent.com/job_mvg-fieldwork-hub/artifacts/ro1zj8fb_ChatGPT%20Image%201%20jul%202026%2C%2001_44_12.png";

// Para fondos claros usamos el mismo logo (el engrane es azul saturado y el
// texto verde tienen suficiente contraste sobre claro).
export const MVG_LOGO_DARK =
  "https://customer-assets.emergentagent.com/job_mvg-fieldwork-hub/artifacts/ro1zj8fb_ChatGPT%20Image%201%20jul%202026%2C%2001_44_12.png";

export const statusLabels: Record<string, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  finalizada: "Finalizada",
};

export const priorityLabels: Record<string, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const statusColor = (s: string) => {
  if (s === "pendiente") return colors.pending;
  if (s === "en_progreso") return colors.inProgress;
  if (s === "finalizada") return colors.completed;
  return colors.textMuted;
};

export const priorityColor = (p: string) => {
  if (p === "alta") return colors.highPriority;
  if (p === "media") return colors.mediumPriority;
  if (p === "baja") return colors.lowPriority;
  return colors.textMuted;
};
