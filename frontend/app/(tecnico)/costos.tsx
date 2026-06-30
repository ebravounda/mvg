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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";
import { StickyHeader } from "@/src/components/StickyHeader";
import { showToast } from "@/src/components/Toast";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";

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
  created_at: string;
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

function formatCLP(n: number): string {
  const num = Math.round(Number(n) || 0);
  return "$" + num.toLocaleString("es-CL");
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatFechaCorta(iso: string): string {
  // 2026-06-30 -> 30 jun 2026
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${String(d).padStart(2, "0")} ${meses[m - 1]} ${y}`;
}

export default function CostosTecnico() {
  const router = useRouter();
  const [items, setItems] = useState<Costo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [total, setTotal] = useState(0);
  const [porCat, setPorCat] = useState<Record<string, number>>({});
  const [fecha, setFecha] = useState<string>(todayISO());

  // Form sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Costo | null>(null);
  const [form, setForm] = useState<{
    categoria: Categoria;
    nombre: string;
    cantidad: string;
    valor: string;
    notas: string;
  }>({ categoria: "traslado", nombre: "", cantidad: "1", valor: "", notas: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/tecnico/costos?fecha=${fecha}`);
      setItems(r.data?.items || []);
      setTotal(r.data?.total || 0);
      setPorCat(r.data?.por_categoria || {});
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error cargando costos", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fecha]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ categoria: "traslado", nombre: "", cantidad: "1", valor: "", notas: "" });
    setSheetOpen(true);
  };

  const openEdit = (c: Costo) => {
    setEditing(c);
    setForm({
      categoria: c.categoria,
      nombre: c.nombre,
      cantidad: String(c.cantidad ?? 1),
      valor: String(c.valor ?? 0),
      notas: c.notas || "",
    });
    setSheetOpen(true);
  };

  const onSave = async () => {
    const nombre = (form.nombre || "").trim();
    const cantidad = parseFloat(String(form.cantidad).replace(",", "."));
    const valor = parseFloat(String(form.valor).replace(/[^\d.,-]/g, "").replace(",", "."));
    if (!nombre) {
      showToast("Ingresa un nombre/descripción", "error");
      return;
    }
    if (!cantidad || cantidad <= 0) {
      showToast("Cantidad debe ser > 0", "error");
      return;
    }
    if (isNaN(valor) || valor < 0) {
      showToast("Valor inválido", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        categoria: form.categoria,
        nombre,
        cantidad,
        valor,
        notas: form.notas || undefined,
        fecha,
      };
      if (editing) {
        await api.patch(`/tecnico/costos/${editing.id}`, payload);
        showToast("Costo actualizado", "success");
      } else {
        await api.post("/tecnico/costos", payload);
        showToast("Costo agregado", "success");
      }
      setSheetOpen(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error al guardar", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (c: Costo) => {
    const confirm = (ok: () => void) => {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(`¿Eliminar "${c.nombre}" por ${formatCLP(c.total)}?`)) ok();
      } else {
        Alert.alert(
          "Eliminar costo",
          `¿Eliminar "${c.nombre}" por ${formatCLP(c.total)}?`,
          [
            { text: "Cancelar", style: "cancel" },
            { text: "Eliminar", style: "destructive", onPress: ok },
          ]
        );
      }
    };
    confirm(async () => {
      try {
        await api.delete(`/tecnico/costos/${c.id}`);
        showToast("Costo eliminado", "success");
        load();
      } catch (e: any) {
        showToast(e?.response?.data?.detail || "Error al eliminar", "error");
      }
    });
  };

  const previewTotal = useMemo(() => {
    const c = parseFloat(String(form.cantidad).replace(",", "."));
    const v = parseFloat(String(form.valor).replace(/[^\d.,-]/g, "").replace(",", "."));
    if (!c || isNaN(v)) return 0;
    return Math.round(c * v);
  }, [form.cantidad, form.valor]);

  const shiftDay = (deltaDays: number) => {
    const [y, m, d] = fecha.split("-").map((x) => parseInt(x, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    const newFecha = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    setFecha(newFecha);
  };

  const isToday = fecha === todayISO();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Costos del día"
        subtitle="Traslados, combustible, alimento, materiales"
        leftSlot={
          <TouchableOpacity
            testID="costos-back-btn"
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textMain} />
          </TouchableOpacity>
        }
        rightSlot={
          <TouchableOpacity
            testID="costos-add-btn"
            onPress={openCreate}
            style={styles.addBtn}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Selector de fecha */}
      <View style={styles.dateBar}>
        <TouchableOpacity
          testID="fecha-prev-btn"
          onPress={() => shiftDay(-1)}
          style={styles.dateNavBtn}
        >
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.dateText}>{formatFechaCorta(fecha)}</Text>
          {isToday && <Text style={styles.dateBadge}>HOY</Text>}
        </View>
        <TouchableOpacity
          testID="fecha-next-btn"
          onPress={() => shiftDay(1)}
          style={styles.dateNavBtn}
          disabled={isToday}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={isToday ? colors.textDim : colors.primary}
          />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
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
          {/* Totales */}
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total del día</Text>
            <Text style={styles.totalAmount}>{formatCLP(total)}</Text>
            <Text style={styles.totalCount}>
              {items.length} {items.length === 1 ? "registro" : "registros"}
            </Text>
          </View>

          {/* Subtotales por categoría */}
          {Object.keys(porCat).length > 0 && (
            <View style={styles.catSummaryGrid}>
              {CATS.filter((c) => (porCat[c.value] || 0) > 0).map((c) => (
                <View
                  key={c.value}
                  style={[styles.catSummaryItem, { borderLeftColor: c.color }]}
                  testID={`subtotal-${c.value}`}
                >
                  <Ionicons name={c.icon} size={18} color={c.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.catSummaryLabel}>{c.label}</Text>
                    <Text style={styles.catSummaryValue}>{formatCLP(porCat[c.value] || 0)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={48} color={colors.textDim} />
              <Text style={styles.emptyTxt}>Sin costos registrados</Text>
              <Text style={styles.emptySub}>Toca el botón + para añadir un gasto</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {items.map((c) => {
                const meta = CAT_MAP[c.categoria] || CAT_MAP.otro;
                return (
                  <TouchableOpacity
                    key={c.id}
                    testID={`costo-item-${c.id}`}
                    style={styles.card}
                    onPress={() => openEdit(c)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.catIconBox, { backgroundColor: `${meta.color}22` }]}>
                      <Ionicons name={meta.icon} size={20} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {c.nombre}
                      </Text>
                      <View style={styles.cardMetaRow}>
                        <Text style={[styles.cardCat, { color: meta.color }]}>{meta.label}</Text>
                        <Text style={styles.cardMeta}>
                          · {c.cantidad} × {formatCLP(c.valor)}
                        </Text>
                      </View>
                      {c.notas ? (
                        <Text style={styles.cardNotas} numberOfLines={1}>
                          {c.notas}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <Text style={styles.cardTotal}>{formatCLP(c.total)}</Text>
                      <TouchableOpacity
                        testID={`costo-del-${c.id}`}
                        onPress={() => onDelete(c)}
                        style={styles.delBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* FAB add (móvil) */}
      <TouchableOpacity
        testID="costos-fab"
        onPress={openCreate}
        style={styles.fab}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Form Sheet */}
      <FormSheet
        visible={sheetOpen}
        onClose={() => !saving && setSheetOpen(false)}
        title={editing ? "Editar costo" : "Nuevo costo"}
        testID="costo-sheet"
      >
        <Text style={styles.label}>Categoría</Text>
        <View style={styles.catChipsRow}>
          {CATS.map((c) => {
            const active = form.categoria === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                testID={`cat-${c.value}`}
                onPress={() => setForm((f) => ({ ...f, categoria: c.value }))}
                style={[
                  styles.catChip,
                  active && { backgroundColor: `${c.color}22`, borderColor: c.color },
                ]}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={c.icon}
                  size={16}
                  color={active ? c.color : colors.textMuted}
                />
                <Text
                  style={[
                    styles.catChipText,
                    active && { color: c.color, fontWeight: "700" },
                  ]}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Field
          label="Nombre / Descripción *"
          value={form.nombre}
          onChangeText={(v) => setForm((f) => ({ ...f, nombre: v }))}
          placeholder="Ej: Bencina 95, Almuerzo, Peaje, Pernos..."
          testID="costo-nombre"
        />

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Cantidad *"
              value={form.cantidad}
              onChangeText={(v) => setForm((f) => ({ ...f, cantidad: v }))}
              placeholder="1"
              keyboardType="decimal-pad"
              testID="costo-cantidad"
            />
          </View>
          <View style={{ flex: 1.4 }}>
            <Field
              label="Valor unitario (CLP) *"
              value={form.valor}
              onChangeText={(v) => setForm((f) => ({ ...f, valor: v.replace(/[^\d]/g, "") }))}
              placeholder="0"
              keyboardType="number-pad"
              testID="costo-valor"
            />
          </View>
        </View>

        {previewTotal > 0 && (
          <View style={styles.previewBox} testID="costo-preview">
            <Text style={styles.previewLabel}>Total</Text>
            <Text style={styles.previewValue}>{formatCLP(previewTotal)}</Text>
          </View>
        )}

        <Field
          label="Notas (opcional)"
          value={form.notas}
          onChangeText={(v) => setForm((f) => ({ ...f, notas: v }))}
          placeholder="Boleta #, comercio, observación..."
          multiline
          testID="costo-notas"
        />

        <Btn
          title={editing ? "Guardar cambios" : "Agregar costo"}
          onPress={onSave}
          loading={saving}
          testID="costo-submit"
          icon={
            <Ionicons name={editing ? "checkmark" : "add"} size={18} color="#fff" />
          }
        />
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  dateBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  dateText: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  dateBadge: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md },
  totalCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
    ...shadow.sm,
  },
  totalLabel: { color: "#fff", fontSize: fontSize.xs, fontWeight: "600", letterSpacing: 0.5 },
  totalAmount: { color: "#fff", fontSize: 32, fontWeight: "800", marginTop: 4 },
  totalCount: { color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, marginTop: 2 },
  catSummaryGrid: {
    gap: spacing.sm,
  },
  catSummaryItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catSummaryLabel: { color: colors.textMuted, fontSize: fontSize.xs },
  catSummaryValue: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  empty: { alignItems: "center", padding: spacing.xxl, gap: spacing.md },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
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
  cardMetaRow: { flexDirection: "row", gap: 4, marginTop: 2, alignItems: "center" },
  cardCat: { fontSize: fontSize.xs, fontWeight: "700" },
  cardMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  cardNotas: { color: colors.textDim, fontSize: fontSize.xs, fontStyle: "italic", marginTop: 2 },
  cardTotal: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.md },
  delBtn: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.dangerSoft,
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.md,
  },
  label: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.sm, marginBottom: 6 },
  catChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  catChipText: { color: colors.textMuted, fontSize: fontSize.sm },
  previewBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  previewLabel: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  previewValue: { color: colors.primary, fontWeight: "800", fontSize: fontSize.lg },
});
