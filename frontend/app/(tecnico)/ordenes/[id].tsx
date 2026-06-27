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
import { DeadlineBadge } from "@/src/components/DeadlineBadge";
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

  const [selectedPp, setSelectedPp] = useState<any>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
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

  const openPpEvidence = (pp: any) => {
    setSelectedPp(pp);
    setFoto(null);
    setNotas("");
    setEvidenceOpen(true);
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
      setFoto(a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
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
      setFoto(a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
    }
  };

  const confirmarPp = async () => {
    if (!foto || !selectedPp) {
      showToast("Adjunta una foto de evidencia", "error");
      return;
    }
    setActionLoading(true);
    try {
      const r = await api.patch(
        `/tecnico/ordenes/${id}/pinpad/${selectedPp.id}`,
        { evidencia_base64: foto, notas }
      );
      setOrden(r.data);
      const stillPending = (r.data.pin_pads || []).filter(
        (p: any) => !p.completed
      ).length;
      if (stillPending === 0) {
        showToast("¡Orden completada! Todas las pin pads actualizadas ✓", "success");
      } else {
        showToast(
          `Pin pad actualizado · Quedan ${stillPending}`,
          "success"
        );
      }
      setEvidenceOpen(false);
      setSelectedPp(null);
      setFoto(null);
      setNotas("");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openMaps = () => {
    const dir = encodeURIComponent(orden?.sucursal?.direccion || "");
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${dir}`);
  };
  const openWaze = () => {
    const dir = encodeURIComponent(orden?.sucursal?.direccion || "");
    Linking.openURL(`https://waze.com/ul?q=${dir}`);
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

  const pinPads = orden.pin_pads || [];
  const completedCount = pinPads.filter((p: any) => p.completed).length;
  const progressPct =
    pinPads.length > 0 ? (completedCount / pinPads.length) * 100 : 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title={orden.numero} showBack />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headBox}>
          <Text style={styles.numero}>{orden.numero}</Text>
          <View style={styles.badges}>
            <StatusBadge status={orden.estado} />
            <PriorityBadge priority={orden.prioridad} />
            <DeadlineBadge fechaLimite={orden.fecha_limite} size="md" />
          </View>
          <Text style={styles.titulo}>{orden.titulo}</Text>
        </View>

        <View style={styles.ccBox}>
          <View style={styles.ccTop}>
            <Ionicons name="pricetag" size={20} color={colors.accent} />
            <Text style={styles.ccLabel}>Código de comercio</Text>
            <Text style={styles.ccValue}>
              {orden.sucursal?.codigo_comercio || "—"}
            </Text>
          </View>
          {orden.sucursal?.direccion && (
            <Text style={styles.ccDir}>{orden.sucursal.direccion}</Text>
          )}
          {(orden.sucursal?.comuna || orden.sucursal?.region) && (
            <Text style={styles.ccMeta}>
              {orden.sucursal?.comuna || ""}
              {orden.sucursal?.region ? ` · Región ${orden.sucursal.region}` : ""}
            </Text>
          )}
          <View style={styles.mapBtns}>
            <TouchableOpacity
              testID="tec-open-waze"
              onPress={openWaze}
              style={[styles.mapBtn, { backgroundColor: "#33CCFF" }]}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.mapBtnText}>Waze</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="tec-open-maps"
              onPress={openMaps}
              style={[styles.mapBtn, { backgroundColor: "#4285F4" }]}
            >
              <Ionicons name="map" size={16} color="#fff" />
              <Text style={styles.mapBtnText}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.progressBox}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressTitle}>
              Pin Pads ({completedCount}/{pinPads.length})
            </Text>
            <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%` },
              ]}
            />
          </View>
        </View>

        {orden.estado === "pendiente" && pinPads.length > 0 && (
          <Btn
            title="Iniciar trabajo"
            onPress={iniciar}
            loading={actionLoading}
            testID="iniciar-trabajo-btn"
            icon={<Ionicons name="play" size={18} color="#fff" />}
          />
        )}

        {pinPads.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>
              Esta orden no tiene pin pads registrados.
            </Text>
          </View>
        )}

        {pinPads.map((pp: any, idx: number) => (
          <View
            key={pp.id}
            style={[
              styles.ppCard,
              pp.completed && { borderColor: colors.completed },
            ]}
            testID={`pinpad-${pp.id}`}
          >
            <View style={styles.ppHeader}>
              <View style={styles.ppNumber}>
                <Text style={styles.ppNumberText}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ppTitle}>
                  {pp.ddll || `Pin Pad ${idx + 1}`}
                </Text>
                <Text style={styles.ppSub}>
                  Serie: {pp.serie || "—"}
                  {pp.modelo ? ` · Modelo: ${pp.modelo}` : ""}
                </Text>
              </View>
              {pp.completed ? (
                <View style={styles.ppDone}>
                  <Ionicons
                    name="checkmark-circle"
                    size={28}
                    color={colors.completed}
                  />
                </View>
              ) : (
                <View style={styles.ppPending}>
                  <Ionicons
                    name="ellipse-outline"
                    size={28}
                    color={colors.textMuted}
                  />
                </View>
              )}
            </View>

            {pp.completed && pp.evidencia_base64 && (
              <Image
                source={{ uri: pp.evidencia_base64 }}
                style={styles.ppPhoto}
                resizeMode="cover"
              />
            )}
            {pp.completed && pp.notas ? (
              <Text style={styles.ppNotas}>📝 {pp.notas}</Text>
            ) : null}
            {pp.completed && pp.completed_at ? (
              <Text style={styles.ppDate}>
                Actualizado:{" "}
                {new Date(pp.completed_at).toLocaleString("es-CL")}
              </Text>
            ) : null}

            {orden.estado !== "finalizada" && (
              <TouchableOpacity
                testID={`pp-evidencia-${pp.id}`}
                style={[
                  styles.ppBtn,
                  pp.completed && { backgroundColor: colors.surfaceAlt },
                ]}
                onPress={() => openPpEvidence(pp)}
              >
                <Ionicons
                  name={pp.completed ? "refresh" : "camera"}
                  size={16}
                  color={pp.completed ? colors.textMuted : "#fff"}
                />
                <Text
                  style={[
                    styles.ppBtnText,
                    pp.completed && { color: colors.textMuted },
                  ]}
                >
                  {pp.completed ? "Volver a tomar foto" : "Tomar foto"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Evidence sheet */}
      <FormSheet
        visible={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title={`Pin Pad ${selectedPp?.ddll || ""}`}
        testID="evidencia-sheet"
      >
        <Text style={styles.helpText}>
          Adjunta foto del trabajo realizado en este pin pad.
        </Text>

        {foto ? (
          <View style={{ gap: spacing.sm }}>
            <Image
              source={{ uri: foto }}
              style={styles.previewPhoto}
              resizeMode="cover"
              testID="pp-preview"
            />
            <TouchableOpacity
              testID="cambiar-foto"
              style={styles.changeBtn}
              onPress={() => setPickerOpen(true)}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.changeBtnText}>Cambiar foto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            testID="agregar-foto"
            style={styles.photoEmpty}
            onPress={() => setPickerOpen(true)}
          >
            <View style={styles.photoEmptyIcon}>
              <Ionicons name="camera" size={32} color={colors.accent} />
            </View>
            <Text style={styles.photoEmptyTitle}>Agregar foto</Text>
            <Text style={styles.photoEmptySub}>Cámara o galería</Text>
          </TouchableOpacity>
        )}

        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Notas (opcional)</Text>
          <TextInput
            testID="pp-notas"
            value={notas}
            onChangeText={setNotas}
            placeholder="Detalles del trabajo..."
            placeholderTextColor={colors.textDim}
            style={styles.notesInput}
            multiline
          />
        </View>

        <Btn
          title="Confirmar pin pad"
          onPress={confirmarPp}
          loading={actionLoading}
          variant="accent"
          disabled={!foto}
          testID="pp-confirmar"
          icon={<Ionicons name="checkmark" size={18} color="#fff" />}
        />
      </FormSheet>

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
            <Text style={styles.pickerSub}>Cámara del dispositivo</Text>
          </View>
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
            <Text style={styles.pickerSub}>Foto guardada</Text>
          </View>
        </TouchableOpacity>
      </FormSheet>
    </SafeAreaView>
  );
}

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
  badges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  titulo: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "800" },

  ccBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    gap: 6,
  },
  ccTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  ccLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    fontWeight: "700",
    flex: 1,
  },
  ccValue: { color: colors.accent, fontSize: fontSize.xl, fontWeight: "900" },
  ccDir: { color: colors.textMain, fontSize: fontSize.md, marginTop: 4 },
  ccMeta: { color: colors.textMuted, fontSize: fontSize.xs },
  mapBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  mapBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  mapBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },

  progressBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  progressPct: { color: colors.accent, fontSize: fontSize.lg, fontWeight: "900" },
  progressBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.completed },

  empty: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },

  ppCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  ppHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  ppNumber: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.primary}33`,
    alignItems: "center",
    justifyContent: "center",
  },
  ppNumberText: { color: colors.primary, fontWeight: "800", fontSize: fontSize.md },
  ppTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  ppSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  ppDone: { width: 36, alignItems: "center" },
  ppPending: { width: 36, alignItems: "center" },
  ppPhoto: {
    width: "100%",
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  ppNotas: { color: colors.textMain, fontSize: fontSize.sm },
  ppDate: { color: colors.textMuted, fontSize: fontSize.xs },
  ppBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  ppBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },

  previewPhoto: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  changeBtn: {
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
  changeBtnText: { color: "#fff", fontWeight: "600", fontSize: fontSize.sm },
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
    minHeight: 80,
    textAlignVertical: "top",
  },
  helpText: { color: colors.textMuted, fontSize: fontSize.sm },
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
