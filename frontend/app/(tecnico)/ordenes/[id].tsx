import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { Btn } from "@/src/components/Form";
import { FormSheet } from "@/src/components/FormSheet";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function TecnicoOrdenDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [orden, setOrden] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [finalizarOpen, setFinalizarOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [notas, setNotas] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/ordenes/${id}`);
      setOrden(r.data);
    } catch {
      showToast("Orden no encontrada", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const iniciar = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/tecnico/ordenes/${id}/iniciar`);
      showToast("Trabajo iniciado", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const ensurePerm = async (
    fn: () => Promise<ImagePicker.PermissionResponse>,
    name: string
  ) => {
    const res = await fn();
    if (res.granted) return true;
    if (!res.canAskAgain) {
      Alert.alert(
        `Permiso de ${name} denegado`,
        `Activa el permiso de ${name} desde los ajustes de la app.`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Abrir Ajustes", onPress: () => Linking.openSettings() },
        ]
      );
    } else {
      showToast(`Permiso de ${name} requerido`, "error");
    }
    return false;
  };

  const tomarFoto = async () => {
    setPickerOpen(false);
    const ok = await ensurePerm(
      ImagePicker.requestCameraPermissionsAsync,
      "cámara"
    );
    if (!ok) return;
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const uri = a.base64
        ? `data:image/jpeg;base64,${a.base64}`
        : a.uri;
      setFoto(uri);
    }
  };

  const elegirGaleria = async () => {
    setPickerOpen(false);
    const ok = await ensurePerm(
      ImagePicker.requestMediaLibraryPermissionsAsync,
      "galería"
    );
    if (!ok) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ["images"],
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      const uri = a.base64
        ? `data:image/jpeg;base64,${a.base64}`
        : a.uri;
      setFoto(uri);
    }
  };

  const finalizar = async () => {
    if (!foto) {
      showToast("Adjunta una foto de evidencia", "error");
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/tecnico/ordenes/${id}/finalizar`, {
        evidencia_base64: foto,
        notas,
      });
      showToast("Orden finalizada ✓", "success");
      setFinalizarOpen(false);
      setFoto(null);
      setNotas("");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading || !orden) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <StickyHeader title="Orden" showBack />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title={orden.numero} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headBox}>
          <Text style={styles.numero}>{orden.numero}</Text>
          <View style={styles.badges}>
            <StatusBadge status={orden.estado} />
            <PriorityBadge priority={orden.prioridad} />
          </View>
          <Text style={styles.titulo}>{orden.titulo}</Text>
        </View>

        <Section title="Cliente / Sucursal">
          <Row
            icon="business-outline"
            label="Cliente"
            value={orden.cliente?.nombre}
          />
          <Row
            icon="location-outline"
            label="Sucursal"
            value={orden.sucursal?.nombre}
          />
          {orden.sucursal?.direccion && (
            <Row
              icon="map-outline"
              label="Dirección"
              value={orden.sucursal.direccion}
            />
          )}
          {orden.sucursal?.encargado && (
            <Row
              icon="person-outline"
              label="Contacto"
              value={orden.sucursal.encargado}
            />
          )}
          {orden.sucursal?.telefono && (
            <Row
              icon="call-outline"
              label="Teléfono"
              value={orden.sucursal.telefono}
            />
          )}
        </Section>

        <Section title="Descripción del trabajo">
          <Text style={styles.descripcion}>{orden.descripcion}</Text>
        </Section>

        {orden.estado === "finalizada" && (
          <Section title="Evidencia enviada">
            {orden.evidencia_base64 && (
              <Image
                source={{ uri: orden.evidencia_base64 }}
                style={styles.evidencia}
                resizeMode="cover"
                testID="tec-evidencia-img"
              />
            )}
            {orden.notas_tecnico ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>Notas</Text>
                <Text style={styles.notes}>{orden.notas_tecnico}</Text>
              </View>
            ) : null}
          </Section>
        )}

        {orden.estado === "pendiente" && (
          <Btn
            title="Iniciar trabajo"
            onPress={iniciar}
            loading={actionLoading}
            testID="iniciar-trabajo-btn"
            icon={<Ionicons name="play" size={18} color="#fff" />}
          />
        )}

        {orden.estado === "en_progreso" && (
          <Btn
            title="Finalizar con evidencia"
            variant="accent"
            onPress={() => setFinalizarOpen(true)}
            testID="finalizar-orden-btn"
            icon={<Ionicons name="camera" size={18} color="#fff" />}
          />
        )}
      </ScrollView>

      {/* Finalizar sheet */}
      <FormSheet
        visible={finalizarOpen}
        onClose={() => setFinalizarOpen(false)}
        title="Finalizar trabajo"
        testID="finalizar-sheet"
      >
        <Text style={styles.helpText}>
          Adjunta una foto de evidencia del trabajo realizado y notas opcionales.
        </Text>

        {foto ? (
          <View style={styles.photoBox}>
            <Image
              source={{ uri: foto }}
              style={styles.photoPreview}
              resizeMode="cover"
              testID="evidencia-preview"
            />
            <TouchableOpacity
              testID="cambiar-foto-btn"
              style={styles.photoChange}
              onPress={() => setPickerOpen(true)}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.photoChangeText}>Cambiar foto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            testID="agregar-foto-btn"
            style={styles.photoEmpty}
            onPress={() => setPickerOpen(true)}
          >
            <View style={styles.photoEmptyIcon}>
              <Ionicons name="camera" size={32} color={colors.accent} />
            </View>
            <Text style={styles.photoEmptyTitle}>Agregar foto</Text>
            <Text style={styles.photoEmptySub}>
              Toma una foto o elige de tu galería
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Notas (opcional)</Text>
          <TextInput
            testID="notas-input"
            value={notas}
            onChangeText={setNotas}
            placeholder="Detalles del trabajo realizado..."
            placeholderTextColor={colors.textDim}
            style={styles.notesInput}
            multiline
          />
        </View>

        <Btn
          title="Confirmar finalización"
          onPress={finalizar}
          loading={actionLoading}
          variant="accent"
          testID="finalizar-confirmar-btn"
          disabled={!foto}
        />
      </FormSheet>

      {/* Picker sheet */}
      <FormSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Agregar foto"
        testID="picker-sheet"
      >
        <TouchableOpacity
          testID="picker-camera"
          style={styles.pickerOpt}
          onPress={tomarFoto}
        >
          <View style={[styles.pickerIcon, { backgroundColor: `${colors.primary}22` }]}>
            <Ionicons name="camera" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerTitle}>Tomar foto</Text>
            <Text style={styles.pickerSub}>Usa la cámara del dispositivo</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="picker-gallery"
          style={styles.pickerOpt}
          onPress={elegirGaleria}
        >
          <View style={[styles.pickerIcon, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name="images" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pickerTitle}>Elegir de la galería</Text>
            <Text style={styles.pickerSub}>Selecciona una foto guardada</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </FormSheet>
    </SafeAreaView>
  );
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

const Row: React.FC<{ icon: any; label: string; value?: string }> = ({
  icon,
  label,
  value,
}) => (
  <View style={styles.detailRow}>
    <View style={styles.detailIcon}>
      <Ionicons name={icon} size={16} color={colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "—"}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: spacing.lg, paddingBottom: 60, gap: spacing.lg },
  headBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  numero: { color: colors.accent, fontWeight: "700", fontSize: fontSize.sm },
  badges: { flexDirection: "row", gap: spacing.sm },
  titulo: { color: colors.textMain, fontSize: fontSize.xl, fontWeight: "800" },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    padding: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  detailIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: `${colors.accent}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  detailLabel: { color: colors.textDim, fontSize: fontSize.xs },
  detailValue: { color: colors.textMain, fontSize: fontSize.sm, fontWeight: "500" },
  descripcion: { color: colors.textMain, fontSize: fontSize.md, lineHeight: 22 },
  evidencia: {
    width: "100%",
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  notesBox: { marginTop: spacing.md, gap: 6 },
  notesLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  notes: { color: colors.textMain, fontSize: fontSize.sm, lineHeight: 20 },
  helpText: { color: colors.textMuted, fontSize: fontSize.sm, marginBottom: 4 },
  photoBox: { gap: spacing.sm },
  photoPreview: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  photoChange: {
    flexDirection: "row",
    alignSelf: "center",
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    gap: 6,
    alignItems: "center",
  },
  photoChangeText: { color: "#fff", fontWeight: "600", fontSize: fontSize.sm },
  photoEmpty: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  photoEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: `${colors.accent}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  photoEmptyTitle: {
    color: colors.textMain,
    fontSize: fontSize.md,
    fontWeight: "700",
  },
  photoEmptySub: { color: colors.textMuted, fontSize: fontSize.sm },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textMain,
    fontSize: fontSize.md,
    minHeight: 90,
    textAlignVertical: "top",
  },
  pickerOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pickerIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  pickerSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
