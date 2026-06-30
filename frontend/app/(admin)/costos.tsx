import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";
import { StickyHeader } from "@/src/components/StickyHeader";
import { showToast } from "@/src/components/Toast";
import { useResponsive } from "@/src/hooks/useResponsive";

type Categoria = "traslado" | "combustible" | "alimento" | "materiales" | "otro";

interface Costo {
  id: string;
  tecnico_id: string;
  categoria: Categoria;
  nombre: string;
  cantidad: number;
  valor: number;
  total: number;
  fecha: string;
  notas?: string | null;
  tecnico?: { id: string; nombre: string; apellidos: string; email?: string };
}

const CATS: { value: Categoria; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { value: "traslado", label: "Traslado", icon: "car-outline", color: "#3B82F6" },
  { value: "combustible", label: "Combustible", icon: "flame-outline", color: "#F97316" },
  { value: "alimento", label: "Alimento", icon: "fast-food-outline", color: "#10B981" },
  { value: "materiales", label: "Materiales", icon: "construct-outline", color: "#8B5CF6" },
  { value: "otro", label: "Otro", icon: "ellipsis-horizontal", color: "#64748B" },
];
const CAT_MAP = CATS.reduce((acc, c) => {
  acc[c.value] = c;
  return acc;
}, {} as Record<Categoria, (typeof CATS)[number]>);

const formatCLP = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");

function isoNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminCostos() {
  const { isDesktop } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<Costo[]>([]);
  const [total, setTotal] = useState(0);
  const [porCat, setPorCat] = useState<Record<string, number>>({});
  const [porTec, setPorTec] = useState<Record<string, number>>({});
  const [tecnicos, setTecnicos] = useState<any[]>([]);

  // filtros
  const [fechaDesde, setFechaDesde] = useState(isoNDaysAgo(30));
  const [fechaHasta, setFechaHasta] = useState(todayISO());
  const [filterTec, setFilterTec] = useState("");
  const [filterCat, setFilterCat] = useState<"" | Categoria>("");

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/admin/tecnicos");
        setTecnicos(r.data || []);
      } catch (e) {
        console.log("tecnicos err", e);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (fechaDesde) p.append("fecha_desde", fechaDesde);
      if (fechaHasta) p.append("fecha_hasta", fechaHasta);
      if (filterTec) p.append("tecnico_id", filterTec);
      if (filterCat) p.append("categoria", filterCat);
      const r = await api.get(`/admin/costos?${p.toString()}`);
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
      setPorCat(r.data?.por_categoria || {});
      setPorTec(r.data?.por_tecnico || {});
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error cargando costos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fechaDesde, fechaHasta, filterTec, filterCat]);

  useEffect(() => {
    load();
  }, [load]);

  const tecMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of tecnicos) m[t.id] = t;
    return m;
  }, [tecnicos]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Costos de técnicos"
        subtitle="Gastos cargados por los técnicos en terreno"
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}
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
      >
        {/* Filtros */}
        <View style={styles.filtersCard}>
          <Text style={styles.filtersTitle}>Filtros</Text>
          <View style={[styles.row, { flexWrap: "wrap" }]}>
            <View style={styles.field}>
              <Text style={styles.label}>Desde</Text>
              <TextInput
                testID="filtro-fecha-desde"
                value={fechaDesde}
                onChangeText={setFechaDesde}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Hasta</Text>
              <TextInput
                testID="filtro-fecha-hasta"
                value={fechaHasta}
                onChangeText={setFechaHasta}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <View style={[styles.field, { minWidth: 180 }]}>
              <Text style={styles.label}>Técnico</Text>
              {Platform.OS === "web" ? (
                <select
                  // @ts-expect-error rn-web
                  value={filterTec}
                  onChange={(e: any) => setFilterTec(e.target.value)}
                  data-testid="filtro-tecnico"
                  style={webSelect}
                >
                  <option value="">Todos</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} {t.apellidos}
                    </option>
                  ))}
                </select>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    const all = ["", ...tecnicos.map((t) => t.id)];
                    const idx = all.indexOf(filterTec);
                    const next = all[(idx + 1) % all.length];
                    setFilterTec(next || "");
                  }}
                  style={styles.input}
                  testID="filtro-tecnico"
                >
                  <Text style={{ color: colors.textMain }}>
                    {filterTec ? `${tecMap[filterTec]?.nombre || ""} ${tecMap[filterTec]?.apellidos || ""}` : "Todos"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={[styles.row, { marginTop: spacing.sm }]}>
            <Text style={[styles.label, { alignSelf: "center" }]}>Categoría:</Text>
            <TouchableOpacity
              testID="cat-all"
              onPress={() => setFilterCat("")}
              style={[styles.catChip, !filterCat && styles.catChipActive]}
            >
              <Text style={[styles.catChipText, !filterCat && { color: "#fff", fontWeight: "700" }]}>
                Todas
              </Text>
            </TouchableOpacity>
            {CATS.map((c) => (
              <TouchableOpacity
                key={c.value}
                testID={`cat-${c.value}`}
                onPress={() => setFilterCat(c.value)}
                style={[
                  styles.catChip,
                  filterCat === c.value && { backgroundColor: c.color, borderColor: c.color },
                ]}
              >
                <Ionicons name={c.icon} size={13} color={filterCat === c.value ? "#fff" : c.color} />
                <Text
                  style={[
                    styles.catChipText,
                    filterCat === c.value && { color: "#fff", fontWeight: "700" },
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Totales */}
        <View style={styles.totalRow}>
          <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatCLP(total)}</Text>
            <Text style={styles.totalSub}>{items.length} registros</Text>
          </View>
          {CATS.filter((c) => (porCat[c.value] || 0) > 0).map((c) => (
            <View key={c.value} style={[styles.smallCard, { borderLeftColor: c.color }]}>
              <Ionicons name={c.icon} size={18} color={c.color} />
              <View style={{ flex: 1 }}>
                <Text style={styles.smallLabel}>{c.label}</Text>
                <Text style={styles.smallValue}>{formatCLP(porCat[c.value] || 0)}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Total por técnico */}
        {Object.keys(porTec).length > 0 && (
          <View style={styles.tecnicoSummary}>
            <Text style={styles.filtersTitle}>Total por técnico</Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {Object.entries(porTec)
                .sort((a, b) => b[1] - a[1])
                .map(([tid, val]) => {
                  const tec = tecMap[tid];
                  return (
                    <View key={tid} style={styles.tecnicoRow}>
                      <View style={styles.tecAvatar}>
                        <Ionicons name="person" size={14} color="#fff" />
                      </View>
                      <Text style={styles.tecName}>
                        {tec ? `${tec.nombre} ${tec.apellidos}` : tid.slice(0, 8)}
                      </Text>
                      <Text style={styles.tecTotal}>{formatCLP(val)}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* Detalle */}
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="cash-outline" size={42} color={colors.textDim} />
            <Text style={styles.emptyTxt}>Sin costos en este rango</Text>
          </View>
        ) : isDesktop ? (
          <View style={styles.tableCard}>
            <View style={styles.tableHead}>
              <Text style={[styles.th, { width: 90 }]}>Fecha</Text>
              <Text style={[styles.th, { flex: 1.2 }]}>Técnico</Text>
              <Text style={[styles.th, { width: 110 }]}>Categoría</Text>
              <Text style={[styles.th, { flex: 1.5 }]}>Nombre</Text>
              <Text style={[styles.th, { width: 60, textAlign: "right" }]}>Cant.</Text>
              <Text style={[styles.th, { width: 100, textAlign: "right" }]}>Valor</Text>
              <Text style={[styles.th, { width: 110, textAlign: "right" }]}>Total</Text>
            </View>
            {items.map((c) => {
              const meta = CAT_MAP[c.categoria] || CAT_MAP.otro;
              return (
                <View key={c.id} style={styles.tableRow} testID={`costo-${c.id}`}>
                  <Text style={[styles.td, { width: 90 }]}>{c.fecha}</Text>
                  <Text style={[styles.td, { flex: 1.2 }]} numberOfLines={1}>
                    {c.tecnico ? `${c.tecnico.nombre} ${c.tecnico.apellidos}` : "—"}
                  </Text>
                  <View style={{ width: 110, flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Ionicons name={meta.icon} size={14} color={meta.color} />
                    <Text style={[styles.td, { color: meta.color, fontWeight: "700" }]}>
                      {meta.label}
                    </Text>
                  </View>
                  <Text style={[styles.td, { flex: 1.5 }]} numberOfLines={1}>
                    {c.nombre}
                    {c.notas ? <Text style={styles.notas}>  · {c.notas}</Text> : null}
                  </Text>
                  <Text style={[styles.td, { width: 60, textAlign: "right" }]}>{c.cantidad}</Text>
                  <Text style={[styles.td, { width: 100, textAlign: "right" }]}>
                    {formatCLP(c.valor)}
                  </Text>
                  <Text
                    style={[styles.td, { width: 110, textAlign: "right", fontWeight: "800" }]}
                  >
                    {formatCLP(c.total)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {items.map((c) => {
              const meta = CAT_MAP[c.categoria] || CAT_MAP.otro;
              return (
                <View key={c.id} style={styles.card} testID={`costo-${c.id}`}>
                  <View style={[styles.catIconBox, { backgroundColor: `${meta.color}22` }]}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {c.nombre}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {c.tecnico ? `${c.tecnico.nombre} ${c.tecnico.apellidos}` : "—"} · {c.fecha}
                    </Text>
                    <Text style={styles.cardMeta}>
                      {c.cantidad} × {formatCLP(c.valor)}
                    </Text>
                  </View>
                  <Text style={styles.cardTotal}>{formatCLP(c.total)}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const webSelect: any = {
  border: `1px solid ${colors.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  color: colors.textMain,
  backgroundColor: "#fff",
  outline: "none",
  minWidth: 160,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  filtersCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  filtersTitle: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.md },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-end" },
  field: { gap: 4 },
  label: { color: colors.textMuted, fontWeight: "700", fontSize: fontSize.xs },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    minWidth: 130,
    color: colors.textMain,
    fontSize: fontSize.sm,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { color: colors.textMuted, fontSize: fontSize.xs },
  totalRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  totalCard: {
    flexGrow: 1,
    minWidth: 200,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.sm,
  },
  totalLabel: { color: "#fff", fontSize: fontSize.xs, fontWeight: "700", letterSpacing: 0.5 },
  totalValue: { color: "#fff", fontSize: 28, fontWeight: "800", marginTop: 2 },
  totalSub: { color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, marginTop: 4 },
  smallCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    minWidth: 160,
    flexGrow: 1,
  },
  smallLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  smallValue: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  tecnicoSummary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tecnicoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tecAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  tecName: { flex: 1, color: colors.textMain, fontWeight: "600" },
  tecTotal: { color: colors.primary, fontWeight: "800" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.md },
  // Tabla desktop
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  tableHead: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "800", textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  td: { color: colors.textMain, fontSize: fontSize.sm },
  notas: { color: colors.textDim, fontStyle: "italic", fontSize: fontSize.xs },
  // Cards móvil
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  cardMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  cardTotal: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.md },
});
