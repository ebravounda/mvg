import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function ClientesList() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "",
    rut: "",
    contacto: "",
    email: "",
    telefono: "",
    direccion: "",
  });

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/clientes");
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

  const openSheet = () => {
    setForm({
      nombre: "",
      rut: "",
      contacto: "",
      email: "",
      telefono: "",
      direccion: "",
    });
    setSheet(true);
  };

  const onSave = async () => {
    if (!form.nombre.trim()) {
      showToast("El nombre es obligatorio", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.email) delete payload.email;
      await api.post("/admin/clientes", payload);
      showToast("Cliente creado", "success");
      setSheet(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Clientes"
        rightSlot={
          <TouchableOpacity
            testID="crear-cliente-btn"
            onPress={openSheet}
            style={styles.headerCta}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : (
        <FlatList
          data={items}
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
              <Ionicons name="business-outline" size={48} color={colors.textDim} />
              <Text style={styles.emptyTxt}>Sin clientes aún</Text>
              <Text style={styles.emptySub}>
                Crea tu primer cliente para empezar
              </Text>
            </View>
          }
          renderItem={({ item: c }) => (
            <TouchableOpacity
              testID={`cliente-card-${c.id}`}
              style={styles.card}
              onPress={() => router.push(`/(admin)/clientes/${c.id}`)}
            >
              <View style={styles.cardIcon}>
                <Ionicons
                  name="business"
                  size={20}
                  color={colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{c.nombre}</Text>
                <View style={styles.metaRow}>
                  {c.rut && <Text style={styles.meta}>RUT {c.rut}</Text>}
                  {c.telefono && (
                    <Text style={styles.meta}>· {c.telefono}</Text>
                  )}
                </View>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        />
      )}

      <FormSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Nuevo cliente"
        testID="cliente-sheet"
      >
        <Field
          label="Nombre / Razón social *"
          value={form.nombre}
          onChangeText={(v) => setForm({ ...form, nombre: v })}
          placeholder="Empresa S.A."
          testID="cliente-nombre"
        />
        <Field
          label="RUT"
          value={form.rut}
          onChangeText={(v) => setForm({ ...form, rut: v })}
          placeholder="76.123.456-7"
          autoCapitalize="none"
          testID="cliente-rut"
        />
        <Field
          label="Persona de contacto"
          value={form.contacto}
          onChangeText={(v) => setForm({ ...form, contacto: v })}
          placeholder="Juan Pérez"
          testID="cliente-contacto"
        />
        <Field
          label="Email"
          value={form.email}
          onChangeText={(v) => setForm({ ...form, email: v })}
          placeholder="contacto@empresa.cl"
          autoCapitalize="none"
          keyboardType="email-address"
          testID="cliente-email"
        />
        <Field
          label="Teléfono"
          value={form.telefono}
          onChangeText={(v) => setForm({ ...form, telefono: v })}
          placeholder="+56 9 1234 5678"
          keyboardType="phone-pad"
          testID="cliente-telefono"
        />
        <Field
          label="Dirección"
          value={form.direccion}
          onChangeText={(v) => setForm({ ...form, direccion: v })}
          placeholder="Av. Principal 123, Santiago"
          testID="cliente-direccion"
        />
        <Btn
          title="Crear cliente"
          onPress={onSave}
          loading={saving}
          testID="cliente-submit"
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  metaRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  meta: { color: colors.textMuted, fontSize: fontSize.xs },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm },
});
