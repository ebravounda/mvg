import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function ComerciosScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/comercios");
      setItems(r.data);
    } catch (e) {
      console.log(e);
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const txt = [
        c.codigo_comercio,
        c.direccion,
        c.comuna,
        c.cliente?.nombre_fantasia,
        c.cliente?.nombre,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return txt.includes(q);
    });
  }, [items, query]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Comercios" showBack />

      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          testID="comercios-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por CC, dirección, comuna..."
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
          autoCapitalize="none"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryText}>
          {filtered.length} de {items.length} comercio{items.length === 1 ? "" : "s"}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{
            padding: spacing.lg,
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
                name="business-outline"
                size={48}
                color={colors.textDim}
              />
              <Text style={styles.emptyTxt}>Sin comercios</Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              testID={`comercio-card-${c.id}`}
              style={styles.card}
              onPress={() => setSelected(c)}
            >
              <View style={styles.cardHead}>
                <View style={styles.ccTag}>
                  <Text style={styles.ccTagText}>CC {c.codigo_comercio}</Text>
                </View>
                <View style={styles.ppBadge}>
                  <Ionicons name="hardware-chip" size={12} color="#fff" />
                  <Text style={styles.ppBadgeText}>{c.pin_pads_count}</Text>
                </View>
              </View>
              <Text style={styles.cardCliente} numberOfLines={1}>
                {c.cliente?.nombre_fantasia || c.cliente?.nombre || "—"}
              </Text>
              {c.direccion && (
                <View style={styles.row}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text style={styles.dir} numberOfLines={2}>
                    {c.direccion}
                  </Text>
                </View>
              )}
              {(c.comuna || c.region) && (
                <Text style={styles.meta}>
                  {c.comuna || ""}
                  {c.region ? ` · Región ${c.region}` : ""}
                </Text>
              )}
              <View style={styles.cardFoot}>
                <Text style={styles.ordCount}>
                  {c.ordenes_count} órden{c.ordenes_count === 1 ? "" : "es"} ·{" "}
                  {c.ordenes_finalizadas} finalizada
                  {c.ordenes_finalizadas === 1 ? "" : "s"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Detail modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalCc}>
                  CC {selected?.codigo_comercio}
                </Text>
                <Text style={styles.modalCliente} numberOfLines={1}>
                  {selected?.cliente?.nombre_fantasia ||
                    selected?.cliente?.nombre}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelected(null)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMain} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {selected?.direccion && (
                <InfoRow icon="location-outline" label="Dirección" value={selected.direccion} />
              )}
              {selected?.comuna && (
                <InfoRow icon="map-outline" label="Comuna" value={selected.comuna} />
              )}
              {selected?.region && (
                <InfoRow icon="globe-outline" label="Región" value={selected.region} />
              )}

              <Text style={styles.sectionTitle}>
                Pin Pads ({selected?.pin_pads?.length || 0})
              </Text>
              {(selected?.pin_pads || []).map((pp: any, idx: number) => (
                <View key={idx} style={styles.ppCard}>
                  <View style={styles.ppHead}>
                    <Text style={styles.ppNumber}>#{idx + 1}</Text>
                    <Text style={styles.ppDdll}>{pp.ddll || "—"}</Text>
                  </View>
                  <View style={styles.ppRow}>
                    <Text style={styles.ppLabel}>Serie:</Text>
                    <Text style={styles.ppValue}>{pp.serie || "—"}</Text>
                  </View>
                  {pp.modelo && (
                    <View style={styles.ppRow}>
                      <Text style={styles.ppLabel}>Modelo:</Text>
                      <Text style={styles.ppValue}>{pp.modelo}</Text>
                    </View>
                  )}
                </View>
              ))}
              {(selected?.pin_pads?.length || 0) === 0 && (
                <Text style={styles.muted}>Sin pin pads registrados</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const InfoRow: React.FC<{ icon: any; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={16} color={colors.accent} />
    <View style={{ flex: 1 }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.textMain, fontSize: fontSize.sm },
  summaryBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  summaryText: { color: colors.textMuted, fontSize: fontSize.xs },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  ccTag: {
    backgroundColor: `${colors.accent}22`,
    borderColor: colors.accent,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  ccTagText: { color: colors.accent, fontWeight: "800", fontSize: fontSize.sm },
  ppBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  ppBadgeText: { color: "#fff", fontWeight: "800", fontSize: fontSize.xs },
  cardCliente: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  row: { flexDirection: "row", gap: 6, alignItems: "flex-start", marginTop: 4 },
  dir: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1 },
  meta: { color: colors.textDim, fontSize: fontSize.xs, marginTop: 2 },
  cardFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  ordCount: { color: colors.textMuted, fontSize: fontSize.xs },
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.md },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
    paddingBottom: spacing.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderLight,
    alignSelf: "center",
    marginTop: spacing.md,
    borderRadius: 2,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  modalCc: { color: colors.accent, fontWeight: "800", fontSize: fontSize.xl },
  modalCliente: { color: colors.textMuted, fontSize: fontSize.sm },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBody: { padding: spacing.lg, gap: spacing.md },
  infoRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  infoLabel: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  infoValue: { color: colors.textMain, fontSize: fontSize.sm },
  sectionTitle: {
    color: colors.textMain,
    fontSize: fontSize.md,
    fontWeight: "800",
    marginTop: spacing.md,
  },
  ppCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ppHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ppNumber: { color: colors.textDim, fontSize: fontSize.xs, fontWeight: "700" },
  ppDdll: { color: colors.accent, fontSize: fontSize.sm, fontWeight: "800" },
  ppRow: { flexDirection: "row", gap: 6 },
  ppLabel: { color: colors.textMuted, fontSize: fontSize.xs, width: 60 },
  ppValue: { color: colors.textMain, fontSize: fontSize.xs, flex: 1 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
