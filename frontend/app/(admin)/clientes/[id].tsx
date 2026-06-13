import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function ClienteDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [cliente, setCliente] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    direccion: "",
    telefono: "",
    encargado: "",
  });

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/admin/clientes/${id}`);
      setCliente(r.data);
    } catch {
      showToast("Cliente no encontrado", "error");
      router.back();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onSaveSucursal = async () => {
    if (!form.nombre.trim()) {
      showToast("Nombre obligatorio", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/sucursales", { ...form, cliente_id: id });
      showToast("Sucursal creada", "success");
      setSheet(false);
      setForm({ nombre: "", direccion: "", telefono: "", encargado: "" });
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDeleteCliente = async () => {
    try {
      await api.delete(`/admin/clientes/${id}`);
      showToast("Cliente eliminado", "success");
      router.back();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const onDeleteSucursal = async (sid: string) => {
    try {
      await api.delete(`/admin/sucursales/${sid}`);
      showToast("Sucursal eliminada", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  if (loading || !cliente) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StickyHeader title="Cliente" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title={cliente.nombre} showBack />
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
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.icon}>
              <Ionicons name="business" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{cliente.nombre}</Text>
              {cliente.rut && <Text style={styles.cardSub}>RUT {cliente.rut}</Text>}
            </View>
          </View>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            {cliente.contacto && (
              <InfoLine icon="person-outline" value={cliente.contacto} />
            )}
            {cliente.email && (
              <InfoLine icon="mail-outline" value={cliente.email} />
            )}
            {cliente.telefono && (
              <InfoLine icon="call-outline" value={cliente.telefono} />
            )}
            {cliente.direccion && (
              <InfoLine icon="location-outline" value={cliente.direccion} />
            )}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Sucursales ({cliente.sucursales?.length || 0})
          </Text>
          <TouchableOpacity
            testID="crear-sucursal-btn"
            onPress={() => setSheet(true)}
            style={styles.addBtn}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>Agregar</Text>
          </TouchableOpacity>
        </View>

        {cliente.sucursales?.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={40} color={colors.textDim} />
            <Text style={styles.emptyTxt}>Sin sucursales</Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {cliente.sucursales.map((s: any) => (
              <View
                key={s.id}
                style={styles.sucCard}
                testID={`sucursal-card-${s.id}`}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.sucNombre}>{s.nombre}</Text>
                  {s.direccion && (
                    <Text style={styles.sucMeta}>📍 {s.direccion}</Text>
                  )}
                  {s.encargado && (
                    <Text style={styles.sucMeta}>👤 {s.encargado}</Text>
                  )}
                  {s.telefono && (
                    <Text style={styles.sucMeta}>📞 {s.telefono}</Text>
                  )}
                </View>
                <TouchableOpacity
                  testID={`eliminar-sucursal-${s.id}`}
                  onPress={() => onDeleteSucursal(s.id)}
                  style={styles.delBtn}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={colors.danger}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Btn
            title="Eliminar cliente"
            variant="danger"
            onPress={onDeleteCliente}
            testID="eliminar-cliente-btn"
            icon={<Ionicons name="trash-outline" size={18} color="#fff" />}
          />
        </View>
      </ScrollView>

      <FormSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Nueva sucursal"
        testID="sucursal-sheet"
      >
        <Field
          label="Nombre *"
          value={form.nombre}
          onChangeText={(v) => setForm({ ...form, nombre: v })}
          placeholder="Sucursal Centro"
          testID="sucursal-nombre"
        />
        <Field
          label="Dirección"
          value={form.direccion}
          onChangeText={(v) => setForm({ ...form, direccion: v })}
          placeholder="Av. Apoquindo 1234"
          testID="sucursal-direccion"
        />
        <Field
          label="Encargado"
          value={form.encargado}
          onChangeText={(v) => setForm({ ...form, encargado: v })}
          placeholder="María Soto"
          testID="sucursal-encargado"
        />
        <Field
          label="Teléfono"
          value={form.telefono}
          onChangeText={(v) => setForm({ ...form, telefono: v })}
          placeholder="+56 2 2345 6789"
          keyboardType="phone-pad"
          testID="sucursal-telefono"
        />
        <Btn
          title="Guardar sucursal"
          onPress={onSaveSucursal}
          loading={saving}
          testID="sucursal-submit"
        />
      </FormSheet>
    </SafeAreaView>
  );
}

const InfoLine: React.FC<{ icon: any; value: string }> = ({ icon, value }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
    <Ionicons name={icon} size={14} color={colors.textMuted} />
    <Text style={{ color: colors.textMain, fontSize: fontSize.sm, flex: 1 }}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  cardSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.lg,
  },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.md },
  sucCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sucNombre: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  sucMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 4 },
  delBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.danger}22`,
    alignItems: "center",
    justifyContent: "center",
  },
});
