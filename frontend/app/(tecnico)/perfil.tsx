import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Switch,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { StickyHeader } from "@/src/components/StickyHeader";
import { api } from "@/src/api/client";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

const DIAS: Array<{ key: DayKey; label: string }> = [
  { key: "lun", label: "Lunes" },
  { key: "mar", label: "Martes" },
  { key: "mie", label: "Miércoles" },
  { key: "jue", label: "Jueves" },
  { key: "vie", label: "Viernes" },
  { key: "sab", label: "Sábado" },
  { key: "dom", label: "Domingo" },
];

type DayKey = "lun" | "mar" | "mie" | "jue" | "vie" | "sab" | "dom";
type DayConfig = { activo: boolean; hora_inicio: string; hora_fin: string };
type Disponibilidad = Record<DayKey, DayConfig>;

const DEFAULT_DISP: Disponibilidad = {
  lun: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  mar: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  mie: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  jue: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  vie: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  sab: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
  dom: { activo: false, hora_inicio: "09:00", hora_fin: "20:00" },
};

// Opciones HH:00 entre 06:00 y 23:00 (técnico puede ajustar)
const HOURS = Array.from({ length: 18 }, (_, i) => {
  const h = 6 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

export default function PerfilTecnico() {
  const { user, logout } = useAuth();
  const [disp, setDisp] = useState<Disponibilidad>(DEFAULT_DISP);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/tecnico/disponibilidad");
      const d = r.data?.disponibilidad as Disponibilidad | undefined;
      if (d) setDisp({ ...DEFAULT_DISP, ...d });
    } catch (e) {
      console.log("disp load err", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateDay = (k: DayKey, patch: Partial<DayConfig>) => {
    setDisp((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  };

  const onSave = async () => {
    // Validación local: si activo, hora_fin > hora_inicio
    for (const d of DIAS) {
      const cfg = disp[d.key];
      if (cfg.activo && cfg.hora_fin <= cfg.hora_inicio) {
        showToast(`En ${d.label}: la hora fin debe ser mayor que la hora inicio`, "error");
        return;
      }
    }
    setSaving(true);
    try {
      await api.put("/tecnico/disponibilidad", disp);
      showToast("Disponibilidad guardada", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  const initials = `${user.nombre?.[0] || ""}${user.apellidos?.[0] || ""}`.toUpperCase();
  const totalActivos = DIAS.filter((d) => disp[d.key].activo).length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Mi perfil" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header de perfil */}
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>
            {user.nombre} {user.apellidos}
          </Text>
          <Text style={styles.role}>Técnico de campo</Text>
        </View>

        {/* Tarjeta datos */}
        <View style={styles.card}>
          <Row icon="mail-outline" label="Email" value={user.email || ""} />
          {user.rut && <Row icon="card-outline" label="RUT" value={user.rut} />}
          {user.telefono && (
            <Row icon="call-outline" label="Teléfono" value={user.telefono} />
          )}
        </View>

        {/* Disponibilidad semanal */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name="calendar-outline" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Disponibilidad semanal</Text>
              <Text style={styles.sectionSub}>
                {totalActivos === 0
                  ? "Sin días seleccionados"
                  : `${totalActivos} día${totalActivos === 1 ? "" : "s"} activos`}
              </Text>
            </View>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
          ) : (
            <View style={{ gap: 8 }}>
              {DIAS.map((d) => {
                const cfg = disp[d.key];
                return (
                  <View
                    key={d.key}
                    testID={`dia-${d.key}`}
                    style={[styles.dayRow, cfg.activo && styles.dayRowActive]}
                  >
                    <View style={styles.dayHead}>
                      <Switch
                        testID={`dia-switch-${d.key}`}
                        value={cfg.activo}
                        onValueChange={(v) => updateDay(d.key, { activo: v })}
                        trackColor={{
                          false: colors.border,
                          true: colors.primary,
                        }}
                        thumbColor="#fff"
                      />
                      <Text
                        style={[
                          styles.dayLabel,
                          cfg.activo && { color: colors.textMain, fontWeight: "700" },
                        ]}
                      >
                        {d.label}
                      </Text>
                    </View>
                    {cfg.activo && (
                      <View style={styles.timeRow}>
                        <TimePicker
                          testID={`hora-inicio-${d.key}`}
                          value={cfg.hora_inicio}
                          onChange={(v) => updateDay(d.key, { hora_inicio: v })}
                          label="Desde"
                        />
                        <Text style={styles.dash}>—</Text>
                        <TimePicker
                          testID={`hora-fin-${d.key}`}
                          value={cfg.hora_fin}
                          onChange={(v) => updateDay(d.key, { hora_fin: v })}
                          label="Hasta"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            testID="disponibilidad-guardar-btn"
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            disabled={saving || loading}
            onPress={onSave}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="checkmark-circle" size={18} color="#fff" />
            )}
            <Text style={styles.saveBtnText}>
              {saving ? "Guardando…" : "Guardar disponibilidad"}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="logout-button"
          style={styles.logoutBtn}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

interface TimePickerProps {
  value: string;
  onChange: (v: string) => void;
  label: string;
  testID?: string;
}

function TimePicker({ value, onChange, label, testID }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  // En web usar select nativo (más simple); en mobile, lista colapsable
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Text style={styles.timeLabel}>{label}</Text>
        {/* eslint-disable react/no-unknown-property */}
        <select
          // @ts-expect-error react native web acepta esto
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 14,
            color: colors.textMain,
            backgroundColor: "#fff",
            outline: "none",
          }}
          data-testid={testID}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.timeLabel}>{label}</Text>
      <TouchableOpacity
        testID={testID}
        style={styles.timeBtn}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={styles.timeBtnText}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdown}>
          {HOURS.map((h) => (
            <TouchableOpacity
              key={h}
              onPress={() => {
                onChange(h);
                setOpen(false);
              }}
              style={[styles.dropdownItem, h === value && { backgroundColor: colors.primarySoft }]}
            >
              <Text style={[styles.dropdownText, h === value && { color: colors.primary, fontWeight: "700" }]}>
                {h}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const Row: React.FC<{ icon: any; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={16} color={colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  header: { alignItems: "center" },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md,
  },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  name: {
    color: colors.textMain,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  role: { color: colors.accent, fontSize: fontSize.sm, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.accent}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: colors.textDim, fontSize: fontSize.xs },
  rowValue: { color: colors.textMain, fontSize: fontSize.sm, fontWeight: "500" },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "800" },
  sectionSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 },
  dayRow: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dayRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  dayHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dayLabel: { color: colors.textMuted, fontSize: fontSize.md, flex: 1 },
  timeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  timeLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 2 },
  dash: { color: colors.textMuted, paddingBottom: 8 },
  timeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  timeBtnText: { color: colors.textMain, fontWeight: "600", fontSize: fontSize.sm },
  dropdown: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    maxHeight: 200,
    zIndex: 10,
    elevation: 4,
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 8 },
  dropdownText: { color: colors.textMain, fontSize: fontSize.sm },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontWeight: "800" },
  logoutBtn: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.danger}15`,
    borderColor: `${colors.danger}55`,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
