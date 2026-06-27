import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { DeadlineBadge } from "@/src/components/DeadlineBadge";
import { colors, spacing, radius, fontSize } from "@/src/theme";

const FILTERS = [
  { label: "Todas", value: "" },
  { label: "Pendientes", value: "pendiente" },
  { label: "En progreso", value: "en_progreso" },
  { label: "Finalizadas", value: "finalizada" },
];

export default function TecnicoOrdenes() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const url = filter
        ? `/tecnico/ordenes?estado=${filter}`
        : "/tecnico/ordenes";
      const [o, s] = await Promise.all([api.get(url), api.get("/tecnico/stats")]);
      setItems(o.data);
      setStats(s.data);
    } catch (e) {
      console.log(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openMaps = (direccion: string) => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Mis órdenes" />

      <View style={styles.greetWrap}>
        <Text style={styles.greet}>Hola, {user?.nombre}</Text>
        <Text style={styles.greetSub}>
          {stats?.pendientes || 0} pendientes · {stats?.en_progreso || 0} en
          progreso
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterScroll}
      >
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <TouchableOpacity
              key={f.value || "all"}
              testID={`tec-filter-${f.value || "all"}`}
              onPress={() => setFilter(f.value)}
              style={[
                styles.chip,
                active && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  active && { color: "#fff", fontWeight: "700" },
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: 100,
            gap: spacing.md,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons
                name="checkmark-done-circle-outline"
                size={56}
                color={colors.completed}
              />
              <Text style={styles.emptyTxt}>¡Sin órdenes!</Text>
              <Text style={styles.emptySub}>
                No tienes órdenes asignadas en este momento
              </Text>
            </View>
          }
          renderItem={({ item: o }) => (
            <TouchableOpacity
              testID={`tec-orden-${o.id}`}
              style={styles.card}
              onPress={() => router.push(`/(tecnico)/ordenes/${o.id}`)}
            >
              <View style={styles.cardHead}>
                <Text style={styles.numero}>{o.numero}</Text>
                <StatusBadge status={o.estado} />
              </View>

              {o.sucursal?.codigo_comercio && (
                <View style={styles.ccPill}>
                  <Ionicons name="pricetag" size={14} color={colors.accent} />
                  <Text style={styles.ccText}>
                    CC {o.sucursal.codigo_comercio}
                  </Text>
                </View>
              )}

              {(o.serie || o.ddll) && (
                <View style={styles.row}>
                  {o.serie && (
                    <Text style={styles.metaBold} numberOfLines={1}>
                      Serie: {o.serie}
                    </Text>
                  )}
                  {o.ddll && (
                    <Text style={styles.metaBold} numberOfLines={1}>
                      · DDLL: {o.ddll}
                    </Text>
                  )}
                </View>
              )}

              {o.sucursal?.direccion && (
                <TouchableOpacity
                  testID={`tec-orden-${o.id}-maps`}
                  onPress={() => openMaps(o.sucursal.direccion)}
                  style={styles.row}
                >
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.meta, { color: colors.primary }]}
                    numberOfLines={1}
                  >
                    {o.sucursal.direccion}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.cardFoot}>
                <View style={{ flexDirection: "row", gap: 6, flex: 1, flexWrap: "wrap" }}>
                  <PriorityBadge priority={o.prioridad} />
                  <DeadlineBadge fechaLimite={o.fecha_limite} />
                </View>
                <View style={styles.actionHint}>
                  <Text style={styles.actionHintText}>
                    {o.estado === "pendiente"
                      ? "Iniciar"
                      : o.estado === "en_progreso"
                      ? "Finalizar"
                      : "Ver"}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={colors.primary}
                  />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  greetWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  greet: { color: colors.textMain, fontSize: fontSize.xl, fontWeight: "800" },
  greetSub: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  filterScroll: { maxHeight: 56, flexGrow: 0 },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  chipText: { color: colors.textMuted, fontSize: fontSize.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  numero: { color: colors.accent, fontWeight: "700", fontSize: fontSize.sm },
  ccPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: `${colors.accent}22`,
    borderWidth: 1,
    borderColor: `${colors.accent}55`,
  },
  ccText: { color: colors.accent, fontWeight: "800", fontSize: fontSize.sm },
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, flexShrink: 1 },
  metaBold: { color: colors.textMain, fontSize: fontSize.xs, fontWeight: "600" },
  cardFoot: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionHint: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionHintText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: "700" },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
