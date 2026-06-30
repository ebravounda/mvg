import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, spacing, radius, fontSize } from "@/src/theme";
import { StickyHeader } from "@/src/components/StickyHeader";
import { showToast } from "@/src/components/Toast";

export default function RutaTecnico() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/tecnico/ruta");
      setData(r.data);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error cargando ruta", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openWaze = (addr: string) =>
    Linking.openURL(`https://waze.com/ul?q=${encodeURIComponent(addr)}`);
  const openMaps = (addr: string) =>
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
    );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StickyHeader title="Mi ruta" />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const ordenes = data?.ordenes_dia || [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Mi ruta de hoy" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        {/* Banner jornada */}
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Jornada estimada</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Inicio</Text>
              <Text style={styles.summaryVal}>{data?.hora_inicio_sugerida || "—"}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Cierre</Text>
              <Text style={styles.summaryVal}>{data?.hora_termino_estimada || "—"}</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryLabel}>Pin Pads</Text>
              <Text style={styles.summaryVal}>{data?.pin_pads_pendientes_dia || 0}</Text>
            </View>
          </View>
          <Text style={styles.summaryFoot}>
            {data?.tecnico_comuna
              ? `Ruta optimizada desde ${data.tecnico_comuna}`
              : "Carga tu dirección + comuna para optimización por cercanía"}{" "}
            · Tope diario: {data?.max_dia} órdenes · {data?.minutos_por_pinpad} min por pin pad
          </Text>
        </View>

        {/* Acceso rápido a Costos del día */}
        <TouchableOpacity
          testID="abrir-costos-btn"
          style={styles.costosBtn}
          onPress={() => router.push("/(tecnico)/costos" as any)}
          activeOpacity={0.85}
        >
          <View style={styles.costosIcon}>
            <Ionicons name="cash-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.costosTitle}>Costos del día</Text>
            <Text style={styles.costosSub}>
              Registra traslados, combustible, alimento y materiales
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        {ordenes.length === 0 && (
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={42} color={colors.textMuted} />
            <Text style={styles.emptyTxt}>¡No tienes órdenes pendientes hoy!</Text>
          </View>
        )}

        {ordenes.map((o: any, idx: number) => {
          const suc = o.sucursal || {};
          const cli = o.cliente || {};
          const dir =
            (suc.direccion ? suc.direccion + ", " : "") +
            (suc.comuna || "") +
            ", Chile";
          const ppPend = (o.pin_pads || []).filter((p: any) => !p.completed).length;
          return (
            <TouchableOpacity
              key={o.id}
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => router.push(`/(tecnico)/ordenes/${o.id}` as any)}
              testID={`ruta-card-${o.id}`}
            >
              <View style={styles.cardHead}>
                <View style={styles.idxBadge}>
                  <Text style={styles.idxText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.numero}>{o.numero}</Text>
                  <Text style={styles.cliente}>{cli.nombre || "—"}</Text>
                </View>
                <View
                  style={[
                    styles.estado,
                    o.estado === "pendiente" && { backgroundColor: colors.dangerSoft },
                    o.estado === "en_progreso" && { backgroundColor: colors.primarySoft },
                    o.estado === "reagendada" && { backgroundColor: colors.dangerSoft },
                  ]}
                >
                  <Text style={styles.estadoText}>
                    {o.estado === "pendiente"
                      ? "Pendiente"
                      : o.estado === "en_progreso"
                      ? "En progreso"
                      : o.estado === "reagendada"
                      ? "Reagendada"
                      : o.estado}
                  </Text>
                </View>
              </View>
              <View style={styles.dirBox}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.dirText} numberOfLines={2}>
                  {suc.nombre} · {suc.direccion || "—"}
                  {suc.comuna ? ` · ${suc.comuna}` : ""}
                </Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statPill}>
                  <Ionicons name="card-outline" size={12} color={colors.primary} />
                  <Text style={styles.statText}>{ppPend} pin pads</Text>
                </View>
                {(o.codigo_comercio || suc.codigo_comercio) && (
                  <View style={styles.statPill}>
                    <Ionicons name="business-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.statText}>
                      CC {o.codigo_comercio || suc.codigo_comercio}
                    </Text>
                  </View>
                )}
              </View>
              {/* Navegación */}
              <View style={styles.navRow}>
                <TouchableOpacity
                  style={[styles.navBtn, styles.wazeBtn]}
                  onPress={() => openWaze(dir)}
                  testID={`waze-${o.id}`}
                >
                  <Ionicons name="navigate" size={14} color="#fff" />
                  <Text style={styles.navBtnText}>Waze</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.navBtn, styles.mapsBtn]}
                  onPress={() => openMaps(dir)}
                  testID={`maps-${o.id}`}
                >
                  <Ionicons name="map" size={14} color="#fff" />
                  <Text style={styles.navBtnText}>Google Maps</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {data?.ordenes_resto?.length > 0 && (
          <View style={styles.restoBox}>
            <Text style={styles.restoText}>
              ⏳ {data.ordenes_resto.length} órdenes pendientes para próximos días
              (excedieron el tope de {data.max_dia})
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    color: colors.textMain,
    fontWeight: "800",
    fontSize: fontSize.md,
    marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  summaryCell: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  summaryLabel: { color: colors.textMuted, fontSize: 10, textTransform: "uppercase" },
  summaryVal: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  summaryFoot: { color: colors.textMuted, fontSize: fontSize.xs },
  empty: { alignItems: "center", padding: spacing.xl, gap: spacing.md },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  idxBadge: {
    width: 36,
    height: 36,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  idxText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  numero: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  cliente: { color: colors.textMuted, fontSize: fontSize.xs },
  estado: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  estadoText: { fontSize: 10, fontWeight: "700", color: colors.textMain },
  dirBox: { flexDirection: "row", gap: 4, alignItems: "flex-start" },
  dirText: { color: colors.textMain, fontSize: fontSize.xs, flex: 1 },
  statsRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statText: { color: colors.textMain, fontSize: 10, fontWeight: "600" },
  navRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  navBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  wazeBtn: { backgroundColor: "#33CCFF" },
  mapsBtn: { backgroundColor: "#4285F4" },
  navBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.xs },
  restoBox: {
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  restoText: { color: colors.textMain, fontSize: fontSize.xs },
  // Costos del día button
  costosBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  costosIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.accent}22`,
  },
  costosTitle: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.md },
  costosSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
