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
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function TecnicosList() {
  const [items, setItems] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    rut: "",
    nombre: "",
    apellidos: "",
    email: "",
    telefono: "",
    password: "",
    bodega_id: "",
  });

  const load = useCallback(async () => {
    try {
      const [r, b] = await Promise.all([
        api.get("/admin/tecnicos"),
        api.get("/admin/bodegas"),
      ]);
      setItems(r.data);
      setBodegas(b.data);
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
      rut: "",
      nombre: "",
      apellidos: "",
      email: "",
      telefono: "",
      password: "",
      bodega_id: "",
    });
    setSheet(true);
  };

  const onSave = async () => {
    if (
      !form.rut ||
      !form.nombre ||
      !form.apellidos ||
      !form.email ||
      !form.telefono ||
      !form.password
    ) {
      showToast("Completa todos los campos", "error");
      return;
    }
    if (form.password.length < 6) {
      showToast("Contraseña mínimo 6 caracteres", "error");
      return;
    }
    setSaving(true);
    try {
      await api.post("/admin/tecnicos", {
        ...form,
        bodega_id: form.bodega_id || null,
      });
      showToast("Técnico creado", "success");
      setSheet(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (tid: string) => {
    try {
      await api.delete(`/admin/tecnicos/${tid}`);
      showToast("Técnico eliminado", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Técnicos"
        rightSlot={
          <TouchableOpacity
            testID="crear-tecnico-btn"
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
          keyExtractor={(t) => t.id}
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
              <Ionicons name="people-outline" size={48} color={colors.textDim} />
              <Text style={styles.emptyTxt}>Sin técnicos</Text>
              <Text style={styles.emptySub}>
                Agrega técnicos para asignarles órdenes
              </Text>
            </View>
          }
          renderItem={({ item: t }) => (
            <View style={styles.card} testID={`tecnico-card-${t.id}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {`${t.nombre?.[0] || ""}${t.apellidos?.[0] || ""}`.toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {t.nombre} {t.apellidos}
                </Text>
                <Text style={styles.meta}>{t.email}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  {t.rut && <Text style={styles.miniTag}>RUT {t.rut}</Text>}
                  {t.telefono && <Text style={styles.miniTag}>{t.telefono}</Text>}
                </View>
              </View>
              <TouchableOpacity
                testID={`eliminar-tecnico-${t.id}`}
                onPress={() => onDelete(t.id)}
                style={styles.delBtn}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      <FormSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Nuevo técnico"
        testID="tecnico-sheet"
      >
        <Field
          label="RUT *"
          value={form.rut}
          onChangeText={(v) => setForm({ ...form, rut: v })}
          placeholder="12.345.678-9"
          autoCapitalize="none"
          testID="tecnico-rut"
        />
        <Field
          label="Nombre *"
          value={form.nombre}
          onChangeText={(v) => setForm({ ...form, nombre: v })}
          placeholder="Juan"
          testID="tecnico-nombre"
        />
        <Field
          label="Apellidos *"
          value={form.apellidos}
          onChangeText={(v) => setForm({ ...form, apellidos: v })}
          placeholder="Pérez González"
          testID="tecnico-apellidos"
        />
        <Field
          label="Email *"
          value={form.email}
          onChangeText={(v) => setForm({ ...form, email: v })}
          placeholder="juan@mvg.cl"
          keyboardType="email-address"
          autoCapitalize="none"
          testID="tecnico-email"
        />
        <Field
          label="Teléfono *"
          value={form.telefono}
          onChangeText={(v) => setForm({ ...form, telefono: v })}
          placeholder="+56 9 1234 5678"
          keyboardType="phone-pad"
          testID="tecnico-telefono"
        />
        <Field
          label="Contraseña inicial *"
          value={form.password}
          onChangeText={(v) => setForm({ ...form, password: v })}
          placeholder="Mínimo 6 caracteres"
          secureTextEntry
          autoCapitalize="none"
          testID="tecnico-password"
        />

        <Text style={styles.bodegaLabel}>Bodega asignada</Text>
        <View style={styles.bodegaPicker}>
          <TouchableOpacity
            testID="tecnico-bodega-empty"
            onPress={() => setForm({ ...form, bodega_id: "" })}
            style={[styles.bodegaChip, !form.bodega_id && styles.bodegaChipActive]}
          >
            <Text
              style={[
                styles.bodegaChipText,
                !form.bodega_id && { color: colors.primary, fontWeight: "700" },
              ]}
            >
              Sin bodega
            </Text>
          </TouchableOpacity>
          {bodegas.map((b) => (
            <TouchableOpacity
              key={b.id}
              testID={`tecnico-bodega-${b.id}`}
              onPress={() => setForm({ ...form, bodega_id: b.id })}
              style={[
                styles.bodegaChip,
                form.bodega_id === b.id && styles.bodegaChipActive,
              ]}
            >
              <Ionicons
                name="storefront-outline"
                size={14}
                color={form.bodega_id === b.id ? colors.primary : colors.textMuted}
              />
              <Text
                style={[
                  styles.bodegaChipText,
                  form.bodega_id === b.id && { color: colors.primary, fontWeight: "700" },
                ]}
              >
                {b.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Btn
          title="Crear técnico"
          onPress={onSave}
          loading={saving}
          testID="tecnico-submit"
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800" },
  name: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  miniTag: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "600",
    backgroundColor: `${colors.accent}22`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  delBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.danger}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },
  bodegaLabel: {
    color: colors.textMain,
    fontWeight: "700",
    fontSize: fontSize.xs,
    letterSpacing: 0.3,
    marginTop: 4,
  },
  bodegaPicker: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bodegaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  bodegaChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  bodegaChipText: { color: colors.textMuted, fontSize: fontSize.sm },
});
