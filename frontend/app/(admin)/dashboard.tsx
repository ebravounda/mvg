import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { showToast } from "@/src/components/Toast";
import { StickyHeader } from "@/src/components/StickyHeader";
import { colors, spacing, radius, fontSize } from "@/src/theme";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";

interface Stats {
  total_ordenes: number;
  en_progreso: number;
  pendientes: number;
  finalizadas: number;
  total_clientes: number;
  total_tecnicos: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const onCleanup = async () => {
    if (cleaning) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "¿Eliminar todas las órdenes con más de 60 días de antigüedad? Esta acción no se puede deshacer."
      );
      if (!ok) return;
    }
    setCleaning(true);
    try {
      const r = await api.post("/admin/ordenes/cleanup?days=60");
      showToast(`${r.data.deleted} órdenes antiguas eliminadas`, "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setCleaning(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/ordenes"),
      ]);
      setStats(s.data);
      setOrdenes(o.data.slice(0, 5));
    } catch (e) {
      console.log("dashboard error", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Inicio" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.greeting}>
          Hola, {user?.nombre || "Admin"}
        </Text>
        <Text style={styles.greetingSub}>Resumen de hoy</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={styles.kpiGrid}>
              <KPI
                value={stats?.en_progreso || 0}
                label="En proceso"
                color={colors.inProgress}
                icon="hourglass-outline"
                testID="kpi-en-proceso"
              />
              <KPI
                value={stats?.pendientes || 0}
                label="Pendientes"
                color={colors.pending}
                icon="time-outline"
                testID="kpi-pendientes"
              />
              <KPI
                value={stats?.finalizadas || 0}
                label="Completadas"
                color={colors.completed}
                icon="checkmark-done-outline"
                testID="kpi-completadas"
              />
              <KPI
                value={stats?.total_ordenes || 0}
                label="Total órdenes"
                color={colors.primary}
                icon="layers-outline"
                testID="kpi-total"
              />
            </View>

            <View style={styles.quickRow}>
              <QuickStat
                value={stats?.total_clientes || 0}
                label="Clientes"
                icon="business-outline"
              />
              <QuickStat
                value={stats?.total_tecnicos || 0}
                label="Técnicos"
                icon="people-outline"
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Órdenes recientes</Text>
              <TouchableOpacity
                testID="ver-todas-ordenes"
                onPress={() => router.push("/(admin)/ordenes")}
              >
                <Text style={styles.linkText}>Ver todas</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              testID="cleanup-60d-btn"
              onPress={onCleanup}
              disabled={cleaning}
              style={[styles.cleanupBtn, cleaning && { opacity: 0.6 }]}
            >
              <Ionicons name="trash-bin-outline" size={18} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cleanupTitle}>
                  {cleaning ? "Eliminando..." : "Borrar datos 60 días de antigüedad"}
                </Text>
                <Text style={styles.cleanupSub}>
                  Limpia órdenes antiguas. Auto-limpieza 40 días al iniciar.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            {ordenes.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons
                  name="clipboard-outline"
                  size={48}
                  color={colors.textDim}
                />
                <Text style={styles.emptyText}>Aún no hay órdenes</Text>
                <TouchableOpacity
                  testID="crear-primera-orden"
                  style={styles.emptyBtn}
                  onPress={() => router.push("/(admin)/ordenes")}
                >
                  <Text style={styles.emptyBtnText}>Crear primera orden</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ gap: spacing.md }}>
                {ordenes.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    testID={`dashboard-orden-${o.id}`}
                    style={styles.ordenCard}
                    onPress={() => router.push(`/(admin)/ordenes/${o.id}`)}
                  >
                    <View style={styles.ordenHead}>
                      <View>
                        <Text style={styles.ordenNumero}>{o.numero}</Text>
                        <Text style={styles.ordenCliente} numberOfLines={1}>
                          {o.cliente?.nombre || "—"}
                        </Text>
                      </View>
                      <StatusBadge status={o.estado} />
                    </View>
                    <Text style={styles.ordenTitulo} numberOfLines={1}>
                      {o.titulo}
                    </Text>
                    <View style={styles.ordenFoot}>
                      <PriorityBadge priority={o.prioridad} />
                      <Text style={styles.ordenTec} numberOfLines={1}>
                        {o.tecnico
                          ? `${o.tecnico.nombre} ${o.tecnico.apellidos}`
                          : "Sin asignar"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const KPI: React.FC<{
  value: number;
  label: string;
  color: string;
  icon: any;
  testID?: string;
}> = ({ value, label, color, icon, testID }) => (
  <View testID={testID} style={[styles.kpi, { borderTopColor: color }]}>
    <View style={[styles.kpiIcon, { backgroundColor: `${color}22` }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

const QuickStat: React.FC<{ value: number; label: string; icon: any }> = ({
  value,
  label,
  icon,
}) => (
  <View style={styles.quickStat}>
    <Ionicons name={icon} size={20} color={colors.accent} />
    <View>
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 80 },
  greeting: {
    color: colors.textMain,
    fontSize: fontSize.xxl,
    fontWeight: "800",
  },
  greetingSub: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.lg,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderTopWidth: 3,
    gap: 6,
  },
  kpiIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: { color: colors.textMain, fontSize: 28, fontWeight: "800" },
  kpiLabel: { color: colors.textMuted, fontSize: fontSize.sm },
  quickRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.xl },
  quickStat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickValue: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  quickLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  linkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "600" },
  ordenCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  ordenHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ordenNumero: { color: colors.accent, fontWeight: "700", fontSize: fontSize.sm },
  ordenCliente: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  ordenTitulo: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "600" },
  ordenFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  ordenTec: { color: colors.textMuted, fontSize: fontSize.xs, flexShrink: 1 },
  empty: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
  emptyBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  emptyBtnText: { color: "#fff", fontWeight: "700" },
  cleanupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: `${colors.danger}55`,
    backgroundColor: `${colors.danger}10`,
    marginBottom: spacing.md,
  },
  cleanupTitle: { color: colors.danger, fontWeight: "700", fontSize: fontSize.sm },
  cleanupSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
