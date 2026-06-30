import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { colors, spacing, radius, fontSize } from "@/src/theme";

const DIAS_LABELS: Record<string, string> = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

const DIAS_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const DIAS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];

interface DispData {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono?: string;
  comuna?: string;
  region?: string;
  disponibilidad: Record<
    string,
    { activo: boolean; hora_inicio: string; hora_fin: string }
  >;
  disponibilidad_updated_at?: string | null;
}

export default function AdminDisponibilidad() {
  const [items, setItems] = useState<DispData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const r = await api.get<DispData[]>("/admin/disponibilidad");
      setItems(r.data);
    } catch (e) {
      console.log("disp load err", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const activos = items.filter((t) =>
    DIAS_KEYS.some((d) => t.disponibilidad?.[d]?.activo)
  );
  const sinConfig = items.length - activos.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Disponibilidad técnicos"
        subtitle={`${items.length} técnicos · ${activos.length} con disponibilidad configurada`}
      />
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={36} color={colors.textDim} />
              <Text style={styles.emptyText}>No hay técnicos registrados</Text>
            </View>
          ) : (
            <>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>Día disponible</Text>
                </View>
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: colors.border, borderWidth: 1, borderColor: colors.textDim },
                    ]}
                  />
                  <Text style={styles.legendText}>No disponible</Text>
                </View>
                {sinConfig > 0 && (
                  <Text style={[styles.legendText, { color: colors.pending }]}>
                    {sinConfig} sin configurar
                  </Text>
                )}
              </View>

              {items.map((t) => (
                <View key={t.id} style={styles.card} testID={`disp-${t.id}`}>
                  <View style={styles.cardHead}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(t.nombre?.[0] || "") + (t.apellidos?.[0] || "")}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>
                        {t.nombre} {t.apellidos}
                      </Text>
                      <Text style={styles.sub}>
                        {t.email}
                        {t.telefono ? ` · ${t.telefono}` : ""}
                      </Text>
                      {(t.comuna || t.region) && (
                        <Text style={styles.subSmall}>
                          📍 {[t.comuna, t.region].filter(Boolean).join(" · ")}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Grid 7 días */}
                  <View style={styles.weekRow}>
                    {DIAS_KEYS.map((k, i) => {
                      const cfg = t.disponibilidad?.[k];
                      const activo = !!cfg?.activo;
                      return (
                        <View key={k} style={styles.dayCell}>
                          <Text style={styles.dayShort}>{DIAS_SHORT[i]}</Text>
                          <View
                            style={[
                              styles.dayPill,
                              activo
                                ? { backgroundColor: colors.primary }
                                : { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
                            ]}
                          >
                            {activo ? (
                              <Ionicons name="checkmark" size={14} color="#fff" />
                            ) : (
                              <Text style={{ color: colors.textMuted, fontSize: 10 }}>—</Text>
                            )}
                          </View>
                          {activo && (
                            <Text style={styles.dayHours}>
                              {cfg.hora_inicio}-{cfg.hora_fin}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Resumen días detallado */}
                  <View style={styles.detail}>
                    {DIAS_KEYS.map((k) => {
                      const cfg = t.disponibilidad?.[k];
                      if (!cfg?.activo) return null;
                      return (
                        <Text key={k} style={styles.detailRow}>
                          • {DIAS_LABELS[k]}: {cfg.hora_inicio} a {cfg.hora_fin}
                        </Text>
                      );
                    })}
                    {!DIAS_KEYS.some((k) => t.disponibilidad?.[k]?.activo) && (
                      <Text style={[styles.detailRow, { color: colors.pending }]}>
                        ⚠ Sin disponibilidad configurada por el técnico
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginBottom: spacing.sm },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendText: { color: colors.textMuted, fontSize: fontSize.xs },
  dot: { width: 10, height: 10, borderRadius: 5 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  name: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  subSmall: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  dayCell: { alignItems: "center", flex: 1, gap: 4 },
  dayShort: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  dayPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dayHours: { color: colors.textMuted, fontSize: 9, marginTop: 2 },
  detail: { gap: 2 },
  detailRow: { color: colors.textMain, fontSize: fontSize.xs },
});
