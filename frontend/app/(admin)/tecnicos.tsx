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
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { useAuth } from "@/src/context/AuthContext";
import { AddressGeocodeField } from "@/src/components/AddressGeocodeField";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function TecnicosList() {
  const router = useRouter();
  const { impersonateTecnico } = useAuth();
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
    direccion: "",
    comuna: "",
    region: "",
    lat: null as number | null,
    lng: null as number | null,
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
      direccion: "",
      comuna: "",
      region: "",
      lat: null,
      lng: null,
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
        direccion: form.direccion || null,
        comuna: form.comuna || null,
        region: form.region || null,
        lat: form.lat,
        lng: form.lng,
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
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar este técnico?")) return;
    try {
      await api.delete(`/admin/tecnicos/${tid}`);
      showToast("Técnico eliminado", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const onImpersonate = async (t: any) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `¿Iniciar sesión como ${t.nombre} ${t.apellidos}?\n\nVerás la app tal como la ve este técnico. Podrás volver a tu sesión de admin con el botón "Volver a admin" en el banner superior.`
      );
      if (!ok) return;
    }
    try {
      await impersonateTecnico(t.id);
      showToast(`Sesión cambiada a ${t.nombre}`, "success");
      router.replace("/(tecnico)/ordenes" as any);
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  // Edit técnico
  const [editSheet, setEditSheet] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    apellidos: "",
    email: "",
    telefono: "",
    bodega_id: "",
    password: "",
    direccion: "",
    comuna: "",
    region: "",
    lat: null as number | null,
    lng: null as number | null,
  });
  const [editSaving, setEditSaving] = useState(false);
  const [sendingWa, setSendingWa] = useState(false);

  const openEdit = (t: any) => {
    setEditing(t);
    setEditForm({
      nombre: t.nombre || "",
      apellidos: t.apellidos || "",
      email: t.email || "",
      telefono: t.telefono || "",
      bodega_id: t.bodega_id || "",
      password: "",
      direccion: t.direccion || "",
      comuna: t.comuna || "",
      region: t.region || "",
      lat: t.lat ?? null,
      lng: t.lng ?? null,
    });
    setEditSheet(true);
  };

  const onEditSave = async () => {
    if (!editing) return;
    setEditSaving(true);
    try {
      const payload: any = {
        nombre: editForm.nombre.trim(),
        apellidos: editForm.apellidos.trim(),
        email: editForm.email.trim(),
        telefono: editForm.telefono.trim(),
        bodega_id: editForm.bodega_id || null,
        direccion: editForm.direccion || null,
        comuna: editForm.comuna || null,
        region: editForm.region || null,
        lat: editForm.lat,
        lng: editForm.lng,
      };
      if (editForm.password.trim()) {
        if (editForm.password.length < 6) {
          showToast("La contraseña debe tener al menos 6 caracteres", "error");
          setEditSaving(false);
          return;
        }
        payload.password = editForm.password;
      }
      await api.patch(`/admin/tecnicos/${editing.id}`, payload);
      showToast("Técnico actualizado", "success");
      setEditSheet(false);
      setEditing(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setEditSaving(false);
    }
  };

  const onSendPasswordWhatsApp = async () => {
    if (!editing) return;
    if (!editForm.password.trim()) {
      showToast(
        "Escribe una contraseña en el campo de abajo antes de enviarla",
        "error"
      );
      return;
    }
    if (editForm.password.length < 6) {
      showToast("La contraseña debe tener al menos 6 caracteres", "error");
      return;
    }
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `¿Enviar la contraseña al WhatsApp ${editing.telefono} de ${editing.nombre}? ` +
          "También actualizará la contraseña del técnico."
      );
      if (!ok) return;
    }
    setSendingWa(true);
    try {
      const r = await api.post(
        `/admin/tecnicos/${editing.id}/enviar-password-whatsapp`,
        { password: editForm.password }
      );
      const wa = r.data?.whatsapp;
      if (wa?.mode === "sent") {
        showToast("Contraseña enviada por WhatsApp ✓", "success");
      } else if (wa?.mode === "fallback_link" || (wa?.mode === "error" && wa?.wa_link)) {
        showToast("Mensaje preparado · Abre WhatsApp manualmente", "info");
      } else {
        showToast("Contraseña actualizada · WhatsApp no enviado", "info");
      }
      setEditSheet(false);
      setEditing(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSendingWa(false);
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
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  {t.rut && <Text style={styles.miniTag}>RUT {t.rut}</Text>}
                  {t.telefono && <Text style={styles.miniTag}>{t.telefono}</Text>}
                  {t.bodega_id &&
                    bodegas.find((b) => b.id === t.bodega_id) && (
                      <Text style={[styles.miniTag, { backgroundColor: colors.accentSoft, color: colors.accent }]}>
                        🏪 {bodegas.find((b) => b.id === t.bodega_id)?.nombre}
                      </Text>
                    )}
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  testID={`impersonate-${t.id}`}
                  onPress={() => onImpersonate(t)}
                  style={styles.impBtn}
                >
                  <Ionicons name="log-in-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`editar-tecnico-${t.id}`}
                  onPress={() => openEdit(t)}
                  style={styles.editBtn}
                >
                  <Ionicons name="create-outline" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`eliminar-tecnico-${t.id}`}
                  onPress={() => onDelete(t.id)}
                  style={styles.delBtn}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
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
        <AddressGeocodeField
          direccion={form.direccion}
          comuna={form.comuna}
          region={form.region}
          lat={form.lat}
          lng={form.lng}
          onChange={(v) =>
            setForm({
              ...form,
              direccion: v.direccion,
              comuna: v.comuna,
              region: v.region,
              lat: v.lat,
              lng: v.lng,
            })
          }
          testIDPrefix="tecnico"
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

      {/* ===== Editar técnico ===== */}
      <FormSheet
        visible={editSheet}
        onClose={() => setEditSheet(false)}
        title={editing ? `Editar: ${editing.nombre} ${editing.apellidos}` : "Editar técnico"}
        testID="tecnico-edit-sheet"
      >
        <Field
          label="Nombre"
          value={editForm.nombre}
          onChangeText={(v) => setEditForm({ ...editForm, nombre: v })}
          placeholder="Nombre"
          testID="edit-nombre"
        />
        <Field
          label="Apellidos"
          value={editForm.apellidos}
          onChangeText={(v) => setEditForm({ ...editForm, apellidos: v })}
          placeholder="Apellidos"
          testID="edit-apellidos"
        />
        <Field
          label="Email de acceso"
          value={editForm.email}
          onChangeText={(v) => setEditForm({ ...editForm, email: v })}
          placeholder="tecnico@mvg.cl"
          keyboardType="email-address"
          autoCapitalize="none"
          testID="edit-email"
        />
        <Field
          label="Teléfono (para WhatsApp)"
          value={editForm.telefono}
          onChangeText={(v) => setEditForm({ ...editForm, telefono: v })}
          placeholder="+56 9 ..."
          keyboardType="phone-pad"
          testID="edit-telefono"
        />

        <AddressGeocodeField
          direccion={editForm.direccion}
          comuna={editForm.comuna}
          region={editForm.region}
          lat={editForm.lat}
          lng={editForm.lng}
          onChange={(v) =>
            setEditForm({
              ...editForm,
              direccion: v.direccion,
              comuna: v.comuna,
              region: v.region,
              lat: v.lat,
              lng: v.lng,
            })
          }
          testIDPrefix="edit-tecnico"
        />

        <Text style={styles.bodegaLabel}>Bodega asignada</Text>
        <View style={styles.bodegaPicker}>
          <TouchableOpacity
            testID="edit-bodega-empty"
            onPress={() => setEditForm({ ...editForm, bodega_id: "" })}
            style={[
              styles.bodegaChip,
              !editForm.bodega_id && styles.bodegaChipActive,
            ]}
          >
            <Text
              style={[
                styles.bodegaChipText,
                !editForm.bodega_id && { color: colors.primary, fontWeight: "700" },
              ]}
            >
              Sin bodega
            </Text>
          </TouchableOpacity>
          {bodegas.map((b) => (
            <TouchableOpacity
              key={b.id}
              testID={`edit-bodega-${b.id}`}
              onPress={() => setEditForm({ ...editForm, bodega_id: b.id })}
              style={[
                styles.bodegaChip,
                editForm.bodega_id === b.id && styles.bodegaChipActive,
              ]}
            >
              <Ionicons
                name="storefront-outline"
                size={14}
                color={
                  editForm.bodega_id === b.id ? colors.primary : colors.textMuted
                }
              />
              <Text
                style={[
                  styles.bodegaChipText,
                  editForm.bodega_id === b.id && {
                    color: colors.primary,
                    fontWeight: "700",
                  },
                ]}
              >
                {b.nombre}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.pwdBox}>
          <Text style={styles.pwdTitle}>🔐 Nueva contraseña (opcional)</Text>
          <Text style={styles.pwdSub}>
            Deja en blanco para no cambiarla. Mínimo 6 caracteres si la modificas.
          </Text>
          <Field
            label=""
            value={editForm.password}
            onChangeText={(v) => setEditForm({ ...editForm, password: v })}
            placeholder="Ej: MiClave123"
            secureTextEntry
            autoCapitalize="none"
            testID="edit-password"
          />
          <TouchableOpacity
            testID="enviar-pwd-whatsapp-btn"
            onPress={onSendPasswordWhatsApp}
            disabled={sendingWa || !editing?.telefono}
            style={[
              styles.waBtn,
              (sendingWa || !editing?.telefono) && { opacity: 0.6 },
            ]}
          >
            {sendingWa ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                <Text style={styles.waBtnText}>
                  Enviar contraseña por WhatsApp
                </Text>
              </>
            )}
          </TouchableOpacity>
          {!editing?.telefono && (
            <Text style={styles.pwdWarn}>
              Este técnico no tiene teléfono registrado.
            </Text>
          )}
        </View>

        <Btn
          title="Guardar cambios"
          onPress={onEditSave}
          loading={editSaving}
          testID="edit-submit"
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
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  impBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  pwdBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pwdTitle: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.sm },
  pwdSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: -2 },
  pwdWarn: {
    color: colors.pending,
    fontSize: fontSize.xs,
    fontStyle: "italic",
  },
  waBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: "#25D366",
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  waBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },
});
