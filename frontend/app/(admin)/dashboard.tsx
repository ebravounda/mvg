import { useCallback, useState } from "react";
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
import { useResponsive } from "@/src/hooks/useResponsive";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";
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
  const { isDesktop } = useResponsive();
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
      setOrdenes(o.data.slice(0, 6));
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

  const completion =
    stats && stats.total_ordenes > 0
      ? Math.round((stats.finalizadas / stats.total_ordenes) * 100)
      : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title={`Hola, ${user?.nombre || "Admin"}`}
        subtitle="Resumen general · Panel de control"
        rightSlot={
          isDesktop ? (
            <TouchableOpacity
              testID="hero-upload-excel-top"
              style={styles.topCta}
              onPress={() =>
                router.push("/(admin)/ordenes?action=upload" as any)
              }
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload" size={16} color="#fff" />
              <Text style={styles.topCtaText}>Subir Excel</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { padding: 32, paddingBottom: 80 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* MOBILE-only greeting */}
        {!isDesktop && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            <Text style={styles.greetingMobile}>
              Hola, {user?.nombre || "Admin"}
            </Text>
            <Text style={styles.greetingSub}>Resumen de hoy</Text>
          </View>
        )}

        {/* HERO upload (mobile only - desktop has it in topbar) */}
        {!isDesktop && (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
            <TouchableOpacity
              testID="hero-upload-excel"
              style={styles.heroCta}
              onPress={() =>
                router.push("/(admin)/ordenes?action=upload" as any)
              }
              activeOpacity={0.9}
            >
              <View style={styles.heroIcon}>
                <Ionicons name="cloud-upload" size={28} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Subir planilla semanal</Text>
                <Text style={styles.heroSub}>
                  Carga el Excel · Crea/actualiza comercios y pin pads
                </Text>
              </View>
              <View style={styles.heroArrow}>
                <Ionicons name="arrow-forward" size={18} color={colors.accent} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <View
            style={
              !isDesktop ? { paddingHorizontal: spacing.lg, paddingTop: spacing.lg } : undefined
            }
          >
            {/* KPI grid */}
            <View style={[styles.kpiGrid, isDesktop && { gap: 20 }]}>
              <KPI
                value={stats?.en_progreso || 0}
                label="En progreso"
                color={colors.inProgress}
                soft={colors.inProgressSoft}
                icon="hourglass-outline"
                testID="kpi-en-proceso"
                isDesktop={isDesktop}
              />
              <KPI
                value={stats?.pendientes || 0}
                label="Pendientes"
                color={colors.pending}
                soft={colors.pendingSoft}
                icon="time-outline"
                testID="kpi-pendientes"
                isDesktop={isDesktop}
              />
              <KPI
                value={stats?.finalizadas || 0}
                label="Completadas"
                color={colors.completed}
                soft={colors.completedSoft}
                icon="checkmark-done-outline"
                testID="kpi-completadas"
                isDesktop={isDesktop}
              />
              <KPI
                value={stats?.total_ordenes || 0}
                label="Total órdenes"
                color={colors.primary}
                soft={colors.primarySoft}
                icon="layers-outline"
                testID="kpi-total"
                isDesktop={isDesktop}
              />
            </View>

            {/* Secondary row: progress + counts */}
            <View style={[styles.secondaryGrid, isDesktop && { gap: 20, marginTop: 20 }]}>
              <View style={[styles.card, styles.progressCard, isDesktop && { flex: 2 }]}>
                <View style={styles.progressHead}>
                  <View>
                    <Text style={styles.progressTitle}>Tasa de finalización</Text>
                    <Text style={styles.progressSub}>
                      {stats?.finalizadas || 0} de {stats?.total_ordenes || 0} órdenes
                    </Text>
                  </View>
                  <Text style={styles.progressPct}>{completion}%</Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.min(completion, 100)}%` },
                    ]}
                  />
                </View>
                <View style={styles.progressLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.completed }]} />
                    <Text style={styles.legendText}>Finalizadas</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.inProgress }]} />
                    <Text style={styles.legendText}>En progreso</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.pending }]} />
                    <Text style={styles.legendText}>Pendientes</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.quickColumn, isDesktop && { flex: 1, gap: 20 }]}>
                <QuickCard
                  value={stats?.total_clientes || 0}
                  label="Clientes activos"
                  icon="business-outline"
                  color={colors.primary}
                  soft={colors.primarySoft}
                />
                <QuickCard
                  value={stats?.total_tecnicos || 0}
                  label="Técnicos"
                  icon="people-outline"
                  color={colors.accent}
                  soft={colors.accentSoft}
                />
              </View>
            </View>

            {/* Recent orders */}
            <View style={[styles.sectionHeader, isDesktop && { marginTop: 32 }]}>
              <View>
                <Text style={styles.sectionTitle}>Órdenes recientes</Text>
                <Text style={styles.sectionSub}>Últimas 6 órdenes registradas</Text>
              </View>
              <TouchableOpacity
                testID="ver-todas-ordenes"
                onPress={() => router.push("/(admin)/ordenes")}
                style={styles.viewAllBtn}
              >
                <Text style={styles.linkText}>Ver todas</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {ordenes.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="clipboard-outline" size={48} color={colors.textDim} />
                <Text style={styles.emptyText}>Aún no hay órdenes</Text>
                <TouchableOpacity
                  testID="crear-primera-orden"
                  style={styles.emptyBtn}
                  onPress={() => router.push("/(admin)/ordenes")}
                >
                  <Text style={styles.emptyBtnText}>Crear primera orden</Text>
                </TouchableOpacity>
              </View>
            ) : isDesktop ? (
              // ===== Desktop: table view =====
              <View style={[styles.card, { padding: 0, overflow: "hidden" }]}>
                <View style={styles.tableHead}>
                  <Text style={[styles.thText, { flex: 1.2 }]}>Orden</Text>
                  <Text style={[styles.thText, { flex: 2 }]}>Cliente / Título</Text>
                  <Text style={[styles.thText, { flex: 1.2 }]}>Técnico</Text>
                  <Text style={[styles.thText, { width: 110 }]}>Prioridad</Text>
                  <Text style={[styles.thText, { width: 130 }]}>Estado</Text>
                </View>
                {ordenes.map((o, idx) => (
                  <TouchableOpacity
                    key={o.id}
                    testID={`dashboard-orden-${o.id}`}
                    style={[
                      styles.tableRow,
                      idx === ordenes.length - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => router.push(`/(admin)/ordenes/${o.id}`)}
                    activeOpacity={0.6}
                  >
                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.tdNumero}>{o.numero}</Text>
                      {o.sucursal?.codigo_comercio && (
                        <Text style={styles.tdMeta}>CC {o.sucursal.codigo_comercio}</Text>
                      )}
                    </View>
                    <View style={{ flex: 2 }}>
                      <Text style={styles.tdTitle} numberOfLines={1}>
                        {o.titulo}
                      </Text>
                      <Text style={styles.tdMeta} numberOfLines={1}>
                        {o.cliente?.nombre_fantasia || o.cliente?.nombre}
                      </Text>
                    </View>
                    <View style={{ flex: 1.2 }}>
                      <Text
                        style={[
                          styles.tdMeta,
                          !o.tecnico && { color: colors.pending, fontWeight: "700" },
                        ]}
                        numberOfLines={1}
                      >
                        {o.tecnico
                          ? `${o.tecnico.nombre} ${o.tecnico.apellidos}`
                          : "Sin asignar"}
                      </Text>
                    </View>
                    <View style={{ width: 110 }}>
                      <PriorityBadge priority={o.prioridad} />
                    </View>
                    <View style={{ width: 130 }}>
                      <StatusBadge status={o.estado} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              // ===== Mobile: cards =====
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

            {/* Cleanup row (subtle on desktop) */}
            <TouchableOpacity
              testID="cleanup-60d-btn"
              onPress={onCleanup}
              disabled={cleaning}
              style={[
                styles.cleanupBtn,
                cleaning && { opacity: 0.6 },
                isDesktop && { marginTop: 24 },
              ]}
            >
              <Ionicons name="trash-bin-outline" size={16} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cleanupTitle}>
                  {cleaning ? "Eliminando..." : "Borrar datos > 60 días"}
                </Text>
                <Text style={styles.cleanupSub}>
                  Limpia órdenes antiguas. Auto-limpieza 40 días al iniciar.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const KPI: React.FC<{
  value: number;
  label: string;
  color: string;
  soft: string;
  icon: any;
  testID?: string;
  isDesktop?: boolean;
}> = ({ value, label, color, soft, icon, testID, isDesktop }) => (
  <View testID={testID} style={[styles.kpi, isDesktop && styles.kpiDesktop]}>
    <View style={styles.kpiTop}>
      <View style={[styles.kpiIcon, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
    </View>
    <Text style={styles.kpiValue}>{value}</Text>
    <Text style={styles.kpiLabel}>{label}</Text>
  </View>
);

const QuickCard: React.FC<{
  value: number;
  label: string;
  icon: any;
  color: string;
  soft: string;
}> = ({ value, label, icon, color, soft }) => (
  <View style={[styles.card, styles.quickCard]}>
    <View style={[styles.kpiIcon, { backgroundColor: soft }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.quickValue}>{value}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: 80 },

  topCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  topCtaText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },

  greetingMobile: {
    color: colors.textMain,
    fontSize: fontSize.xxl,
    fontWeight: "800",
  },
  greetingSub: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },

  heroCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: { color: "#fff", fontSize: fontSize.lg, fontWeight: "800" },
  heroSub: {
    color: "rgba(255,255,255,0.85)",
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  heroArrow: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },

  // KPI grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  kpi: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
    ...shadow.sm,
  },
  kpiDesktop: {
    flexBasis: 0,
    minWidth: 180,
    padding: 20,
  },
  kpiTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  kpiValue: {
    color: colors.textMain,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  kpiLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "500" },

  // Secondary grid (progress + quick cards)
  secondaryGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
    flexWrap: "wrap",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  progressCard: {
    flexBasis: "100%",
    gap: spacing.md,
  },
  progressHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  progressTitle: {
    color: colors.textMain,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  progressSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  progressPct: {
    color: colors.completed,
    fontSize: 32,
    fontWeight: "800",
    letterSpacing: -1,
  },
  progressTrack: {
    height: 10,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.completed,
    borderRadius: radius.full,
  },
  progressLegend: { flexDirection: "row", gap: spacing.lg, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.textMuted, fontSize: fontSize.xs },

  quickColumn: {
    flexBasis: "100%",
    gap: spacing.md,
  },
  quickCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  quickValue: {
    color: colors.textMain,
    fontSize: fontSize.xl,
    fontWeight: "800",
  },
  quickLabel: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  // Section
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: fontSize.lg,
    fontWeight: "800",
  },
  sectionSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  viewAllBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  linkText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },

  // Table (desktop)
  tableHead: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  thText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tdNumero: { color: colors.accent, fontWeight: "700", fontSize: fontSize.sm },
  tdTitle: { color: colors.textMain, fontWeight: "600", fontSize: fontSize.sm },
  tdMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  // Mobile cards
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
  ordenTitulo: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
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
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginTop: spacing.lg,
  },
  cleanupTitle: { color: colors.danger, fontWeight: "700", fontSize: fontSize.sm },
  cleanupSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
