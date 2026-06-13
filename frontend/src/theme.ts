// Theme constants for MVG Computación
export const colors = {
  background: "#0B1121",
  surface: "#1E293B",
  surfaceAlt: "#0F172A",
  surfaceElevated: "#283447",
  primary: "#2563EB",
  primaryHover: "#1D4ED8",
  accent: "#F97316",
  accentHover: "#EA580C",
  textMain: "#F8FAFC",
  textMuted: "#94A3B8",
  textDim: "#64748B",
  border: "#334155",
  borderLight: "#475569",
  pending: "#F59E0B",
  inProgress: "#3B82F6",
  completed: "#10B981",
  highPriority: "#EF4444",
  mediumPriority: "#F59E0B",
  lowPriority: "#10B981",
  danger: "#EF4444",
  white: "#FFFFFF",
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

export const MVG_LOGO_URL =
  "https://customer-assets.emergentagent.com/job_mvg-fieldwork-hub/artifacts/15s9o622_99899115-7203-4918-A54A-F1EFF160AC0C.png";

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
