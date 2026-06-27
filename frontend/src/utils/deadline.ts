import { colors } from "@/src/theme";

export interface DeadlineInfo {
  color: string;
  bg: string;
  border: string;
  label: string;
  status: "ok" | "warning" | "overdue" | "none";
}

/**
 * Returns coloring + label info for a deadline date.
 * - Green: more than 2 days away
 * - Yellow: 0-2 days remaining
 * - Red: overdue (past today)
 */
export function getDeadlineInfo(
  fechaLimite?: string | null
): DeadlineInfo {
  if (!fechaLimite) {
    return {
      color: colors.textMuted,
      bg: "transparent",
      border: colors.border,
      label: "Sin fecha límite",
      status: "none",
    };
  }
  const target = new Date(fechaLimite);
  // Set both to start of day for diff
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const formatted = target.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (diffDays < 0) {
    return {
      color: colors.danger,
      bg: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.45)",
      label: `Vencida · ${formatted}`,
      status: "overdue",
    };
  }
  if (diffDays <= 2) {
    return {
      color: colors.pending,
      bg: "rgba(245,158,11,0.12)",
      border: "rgba(245,158,11,0.45)",
      label:
        diffDays === 0
          ? `Hoy · ${formatted}`
          : `En ${diffDays}d · ${formatted}`,
      status: "warning",
    };
  }
  return {
    color: colors.completed,
    bg: "rgba(16,185,129,0.12)",
    border: "rgba(16,185,129,0.45)",
    label: `En ${diffDays}d · ${formatted}`,
    status: "ok",
  };
}
