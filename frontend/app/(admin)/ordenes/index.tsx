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
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Select, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

const FILTERS = [
  { label: "Todas", value: "" },
  { label: "Pendientes", value: "pendiente" },
  { label: "En progreso", value: "en_progreso" },
  { label: "Finalizadas", value: "finalizada" },
];

export default function OrdenesList() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("");
  const [sheet, setSheet] = useState(false);

  // form
  const [clientes, setClientes] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [form, setForm] = useState({
    cliente_id: "",
    sucursal_id: "",
    tecnico_id: "",
    titulo: "",
    descripcion: "",
    prioridad: "media",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const url = filter ? `/admin/ordenes?estado=${filter}` : "/admin/ordenes";
      const r = await api.get(url);
      setItems(r.data);
    } catch (e) {
      console.log("ordenes load err", e);
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

  const openSheet = async () => {
    setForm({
      cliente_id: "",
      sucursal_id: "",
      tecnico_id: "",
      titulo: "",
      descripcion: "",
      prioridad: "media",
    });
    setSheet(true);
    try {
      const [c, t] = await Promise.all([
        api.get("/admin/clientes"),
        api.get("/admin/tecnicos"),
      ]);
      setClientes(c.data);
      setTecnicos(t.data);
    } catch (e) {
      console.log(e);
    }
  };

  const onSelectCliente = async (cliente_id: string) => {
    setForm((f) => ({ ...f, cliente_id, sucursal_id: "" }));
    try {
      const r = await api.get(`/admin/sucursales?cliente_id=${cliente_id}`);
      setSucursales(r.data);
    } catch {
      setSucursales([]);
    }
  };

  const onSave = async () => {
    if (
      !form.cliente_id ||
      !form.sucursal_id ||
      !form.tecnico_id ||
      !form.titulo ||
      !form.descripcion
    ) {
      showToast("Completa todos los campos obligatorios", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/ordenes", form);
      showToast("Orden creada", "success");
      setSheet(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error al crear orden", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Órdenes"
        rightSlot={
          <TouchableOpacity
            testID="crear-orden-btn"
            onPress={openSheet}
            style={styles.headerCta}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

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
              testID={`filter-${f.value || "all"}`}
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
        <ActivityIndicator
          color={colors.primary}
          style={{ marginTop: 30 }}
        />
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
                name="clipboard-outline"
                size={48}
                color={colors.textDim}
              />
              <Text style={styles.emptyTxt}>No hay órdenes</Text>
              <Text style={styles.emptySub}>
                Toca el botón + para crear una nueva orden
              </Text>
            </View>
          }
          renderItem={({ item: o }) => (
            <TouchableOpacity
              testID={`orden-card-${o.id}`}
              style={styles.card}
              onPress={() => router.push(`/(admin)/ordenes/${o.id}`)}
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
              <View style={styles.row}>
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.meta} numberOfLines={1}>
                  {o.tecnico
                    ? `${o.tecnico.nombre} ${o.tecnico.apellidos}`
                    : "Sin asignar"}
                </Text>
              </View>
              <View style={styles.cardFoot}>
                <PriorityBadge priority={o.prioridad} />
                <Text style={styles.dateText}>
                  {new Date(o.created_at).toLocaleDateString("es-CL")}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      <FormSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Nueva orden de servicio"
        testID="nueva-orden-sheet"
      >
        <Select
          label="Cliente"
          value={form.cliente_id}
          onChange={onSelectCliente}
          options={clientes.map((c) => ({ label: c.nombre, value: c.id }))}
          testID="orden-cliente"
        />
        {form.cliente_id && (
          <Select
            label="Sucursal"
            value={form.sucursal_id}
            onChange={(v) => setForm((f) => ({ ...f, sucursal_id: v }))}
            options={sucursales.map((s) => ({ label: s.nombre, value: s.id }))}
            testID="orden-sucursal"
          />
        )}
        <Select
          label="Técnico"
          value={form.tecnico_id}
          onChange={(v) => setForm((f) => ({ ...f, tecnico_id: v }))}
          options={tecnicos.map((t) => ({
            label: `${t.nombre} ${t.apellidos}`,
            value: t.id,
          }))}
          testID="orden-tecnico"
        />
        <Select
          label="Prioridad"
          value={form.prioridad}
          onChange={(v) => setForm((f) => ({ ...f, prioridad: v }))}
          options={[
            { label: "Baja", value: "baja" },
            { label: "Media", value: "media" },
            { label: "Alta", value: "alta" },
          ]}
          testID="orden-prioridad"
        />
        <Field
          label="Título"
          value={form.titulo}
          onChangeText={(v) => setForm((f) => ({ ...f, titulo: v }))}
          placeholder="Ej: Mantención impresora"
          testID="orden-titulo"
        />
        <Field
          label="Descripción del problema"
          value={form.descripcion}
          onChangeText={(v) => setForm((f) => ({ ...f, descripcion: v }))}
          placeholder="Detalla el problema reportado..."
          multiline
          testID="orden-descripcion"
        />
        <Btn
          title="Crear orden"
          onPress={onSave}
          loading={saving}
          testID="orden-crear-submit"
        />
      </FormSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  headerCta: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
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
  dateText: { color: colors.textDim, fontSize: fontSize.xs },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
});
