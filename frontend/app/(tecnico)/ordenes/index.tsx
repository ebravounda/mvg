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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Mis órdenes" />

      <View style={styles.greetWrap}>
        <Text style={styles.greet}>Hola, {user?.nombre}</Text>
        <Text style={styles.greetSub}>
          Tienes {stats?.pendientes || 0} pendiente
          {stats?.pendientes === 1 ? "" : "s"} ·{" "}
          {stats?.en_progreso || 0} en progreso
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
              <Text style={styles.titulo} numberOfLines={1}>
                {o.titulo}
              </Text>
              <View style={styles.row}>
                <Ionicons
                  name="business-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.meta} numberOfLines={1}>
                  {o.cliente?.nombre} · {o.sucursal?.nombre}
                </Text>
              </View>
              {o.sucursal?.direccion && (
                <View style={styles.row}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text style={styles.meta} numberOfLines={1}>
                    {o.sucursal.direccion}
                  </Text>
                </View>
              )}
              <View style={styles.cardFoot}>
                <PriorityBadge priority={o.prioridad} />
                <View style={styles.actionHint}>
                  <Text style={styles.actionHintText}>
                    {o.estado === "pendiente"
                      ? "Iniciar trabajo"
                      : o.estado === "en_progreso"
                      ? "Finalizar trabajo"
                      : "Ver detalle"}
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
  greetWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
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
  titulo: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, flexShrink: 1 },
  cardFoot: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionHint: { flexDirection: "row", alignItems: "center", gap: 2 },
  actionHintText: { color: colors.primary, fontSize: fontSize.xs, fontWeight: "600" },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
