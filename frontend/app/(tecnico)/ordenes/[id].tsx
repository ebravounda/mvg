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

  // Materials used per pin-pad evidence
  const [stock, setStock] = useState<any[]>([]);
  const [materialesUsados, setMaterialesUsados] = useState<
    { sku: string; descripcion: string; cantidad: number; max: number }[]
  >([]);
  const [sinSuministros, setSinSuministros] = useState(false);
  const [matPickerOpen, setMatPickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/ordenes/${id}`);
      setOrden(r.data);
      // Load my stock for materials picker
      try {
        const s = await api.get("/tecnico/inventario");
        setStock(s.data);
      } catch {}
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
    setMaterialesUsados([]);
    setSinSuministros(false);
    setEvidenceOpen(true);
  };

  const addMaterial = (s: any) => {
    setMaterialesUsados((prev) => {
      const ex = prev.find((p) => p.sku === s.sku);
      if (ex) return prev; // already added
      return [
        ...prev,
        {
          sku: s.sku,
          descripcion: s.descripcion || s.producto?.descripcion || "",
          cantidad: 1,
          max: s.cantidad,
        },
      ];
    });
    setMatPickerOpen(false);
  };

  const updateMaterial = (sku: string, qty: number) => {
    setMaterialesUsados((prev) =>
      prev.map((m) => (m.sku === sku ? { ...m, cantidad: Math.max(1, qty) } : m))
    );
  };

  const removeMaterial = (sku: string) => {
    setMaterialesUsados((prev) => prev.filter((m) => m.sku !== sku));
  };

  // 30-min edit window helpers
  const EDIT_WINDOW_MIN = 30;
  const isWithinEditWindow = (uploadedIso: string): boolean => {
    try {
      const u = new Date(uploadedIso).getTime();
      return Date.now() - u < EDIT_WINDOW_MIN * 60 * 1000;
    } catch {
      return false;
    }
  };
  const formatEditDeadline = (uploadedIso: string): string => {
    try {
      const u = new Date(uploadedIso).getTime();
      const deadline = new Date(u + EDIT_WINDOW_MIN * 60 * 1000);
      return deadline.toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const onDeletePhoto = async (pp: any) => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "¿Eliminar esta foto? Podrás volver a tomarla. Solo dispones de 30 min desde la subida."
      );
      if (!ok) return;
    }
    try {
      const r = await api.delete(
        `/tecnico/ordenes/${id}/pinpad/${pp.id}/foto`
      );
      setOrden(r.data);
      showToast("Foto eliminada", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
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
      quality: 0.35,
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
      quality: 0.35,
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
    if (materialesUsados.length === 0 && !sinSuministros) {
      showToast(
        'Selecciona los materiales utilizados o marca "No se utilizaron suministros".',
        "error"
      );
      return;
    }
    setActionLoading(true);
    try {
      // Detect if this confirmation will close the order (last incomplete pp)
      const remainingAfter =
        (orden?.pin_pads || []).filter(
          (p: any) => !p.completed && p.id !== selectedPp.id
        ).length;
      const willClose = remainingAfter === 0;

      const payload: any = {
        evidencia_base64: foto,
        notas,
        materiales_usados: materialesUsados.map((m) => ({
          sku: m.sku,
          descripcion: m.descripcion,
          cantidad: m.cantidad,
        })),
        sin_suministros: sinSuministros && materialesUsados.length === 0,
      };
      if (willClose) {
        try {
          showToast("Solicitando ubicación...", "info");
          const { captureLocation } = await import("@/src/utils/geolocation");
          const loc = await captureLocation();
          payload.lat = loc.lat;
          payload.lng = loc.lng;
          payload.accuracy_m = loc.accuracy;
          payload.address = loc.address;
        } catch (geoErr: any) {
          setActionLoading(false);
          showToast(
            geoErr?.message ||
              "Ubicación obligatoria para cerrar la orden. Autoriza la ubicación.",
            "error"
          );
          return;
        }
      }

      const r = await api.patch(
        `/tecnico/ordenes/${id}/pinpad/${selectedPp.id}`,
        payload
      );
      setOrden(r.data);

      // Stock deduction now happens server-side atomically.
      // Refresh local stock cache.
      if (materialesUsados.length > 0) {
        try {
          const ns = await api.get("/tecnico/inventario");
          setStock(ns.data);
        } catch {}
      }

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
      setMaterialesUsados([]);
      setSinSuministros(false);
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

            {/* Photo edit/delete window (30 min) */}
            {pp.completed &&
              pp.uploaded_at &&
              orden.estado !== "finalizada" &&
              isWithinEditWindow(pp.uploaded_at) && (
                <View style={styles.editRow} testID={`pp-edit-${pp.id}`}>
                  <Ionicons name="time-outline" size={13} color={colors.pending} />
                  <Text style={styles.editText}>
                    Puedes editar hasta:{" "}
                    {formatEditDeadline(pp.uploaded_at)}
                  </Text>
                  <TouchableOpacity
                    testID={`pp-delete-${pp.id}`}
                    onPress={() => onDeletePhoto(pp)}
                    style={styles.editBtnIcon}
                  >
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              )}

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
                  {pp.completed ? "Reemplazar foto" : "Tomar foto"}
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

        {/* Materials used */}
        <View style={{ gap: 8 }}>
          <View style={styles.matHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Materiales utilizados *</Text>
              <Text style={styles.matSub}>
                Se descontarán automáticamente de tu stock
              </Text>
            </View>
            <TouchableOpacity
              testID="add-material-btn"
              onPress={() => {
                setSinSuministros(false);
                setMatPickerOpen(true);
              }}
              style={[styles.matAdd, stock.length === 0 && { opacity: 0.5 }]}
              disabled={stock.length === 0}
            >
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.matAddText}>Agregar</Text>
            </TouchableOpacity>
          </View>

          {/* "No se utilizaron suministros" toggle */}
          <TouchableOpacity
            testID="no-supplies-toggle"
            onPress={() => {
              if (!sinSuministros) setMaterialesUsados([]);
              setSinSuministros((v) => !v);
            }}
            style={[
              styles.noSupBox,
              sinSuministros && styles.noSupBoxActive,
            ]}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.checkBox,
                sinSuministros && { backgroundColor: colors.primary, borderColor: colors.primary },
              ]}
            >
              {sinSuministros && (
                <Ionicons name="checkmark" size={14} color="#fff" />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.noSupTitle}>No se utilizaron suministros</Text>
              <Text style={styles.noSupSub}>
                Marca esto si no usaste ningún material para este pin pad
              </Text>
            </View>
          </TouchableOpacity>

          {stock.length === 0 && !sinSuministros && (
            <Text style={styles.matEmpty}>
              No tienes stock asignado. Solicita suministros desde la pestaña
              "Suministros" o marca "No se utilizaron suministros".
            </Text>
          )}
          {materialesUsados.map((m) => (
            <View key={m.sku} style={styles.matRow} testID={`mat-row-${m.sku}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.matSku}>SKU {m.sku}</Text>
                <Text style={styles.matDesc} numberOfLines={1}>
                  {m.descripcion}
                </Text>
                <Text style={styles.matStock}>Stock disponible: {m.max}</Text>
              </View>
              <View style={styles.matQtyBox}>
                <TouchableOpacity
                  testID={`mat-minus-${m.sku}`}
                  onPress={() => updateMaterial(m.sku, m.cantidad - 1)}
                  style={styles.matQtyBtn}
                >
                  <Ionicons name="remove" size={12} color={colors.textMain} />
                </TouchableOpacity>
                <Text style={styles.matQtyValue}>{m.cantidad}</Text>
                <TouchableOpacity
                  testID={`mat-plus-${m.sku}`}
                  onPress={() => updateMaterial(m.sku, m.cantidad + 1)}
                  style={styles.matQtyBtn}
                >
                  <Ionicons name="add" size={12} color={colors.textMain} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                testID={`mat-remove-${m.sku}`}
                onPress={() => removeMaterial(m.sku)}
                style={styles.matDel}
              >
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <Btn
          title="Confirmar pin pad"
          onPress={confirmarPp}
          loading={actionLoading}
          variant="accent"
          disabled={!foto || (materialesUsados.length === 0 && !sinSuministros)}
          testID="pp-confirmar"
          icon={<Ionicons name="checkmark" size={18} color="#fff" />}
        />
      </FormSheet>

      {/* Materials picker - opens from inside evidence sheet */}
      <FormSheet
        visible={matPickerOpen}
        onClose={() => setMatPickerOpen(false)}
        title="Selecciona material"
        testID="mat-picker-sheet"
      >
        {stock.length === 0 ? (
          <Text style={styles.matEmpty}>
            No tienes stock asignado. Solicita suministros desde la pestaña
            "Suministros".
          </Text>
        ) : (
          stock
            .filter((s) => !materialesUsados.find((m) => m.sku === s.sku))
            .map((s) => (
              <TouchableOpacity
                key={s.id}
                testID={`mat-pick-${s.sku}`}
                onPress={() => addMaterial(s)}
                style={styles.matPickRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.matSku}>SKU {s.sku}</Text>
                  <Text style={styles.matDesc} numberOfLines={1}>
                    {s.descripcion}
                  </Text>
                </View>
                <View style={styles.matStockBadge}>
                  <Text style={styles.matStockBadgeText}>{s.cantidad}</Text>
                </View>
                <Ionicons name="add-circle" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))
        )}
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

  // Materials
  matHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  matSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  matAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  matAddText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },
  matEmpty: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: "italic",
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noSupBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  noSupBoxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  noSupTitle: { color: colors.textMain, fontSize: fontSize.sm, fontWeight: "700" },
  noSupSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  matRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  matSku: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: fontSize.xs,
    fontFamily: "monospace" as any,
  },
  matDesc: { color: colors.textMain, fontSize: fontSize.sm, marginTop: 2 },
  matStock: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  matQtyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
  },
  matQtyBtn: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  matQtyValue: {
    color: colors.textMain,
    fontWeight: "800",
    fontSize: fontSize.sm,
    minWidth: 16,
    textAlign: "center",
  },
  matDel: {
    width: 28,
    height: 28,
    borderRadius: radius.md,
    backgroundColor: `${colors.danger}11`,
    alignItems: "center",
    justifyContent: "center",
  },
  matPickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  matStockBadge: {
    backgroundColor: `${colors.completed}1a`,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    minWidth: 32,
    alignItems: "center",
  },
  matStockBadgeText: { color: colors.completed, fontWeight: "800", fontSize: fontSize.xs },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: `${colors.pending}1a`,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.pending,
    marginTop: 4,
  },
  editText: {
    color: colors.pending,
    fontSize: fontSize.xs,
    fontWeight: "600",
    flex: 1,
  },
  editBtnIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: `${colors.danger}11`,
    alignItems: "center",
    justifyContent: "center",
  },
});
