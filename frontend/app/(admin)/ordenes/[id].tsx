import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Linking,
  Modal,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { LocationMap } from "@/src/components/LocationMap";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { DeadlineBadge } from "@/src/components/DeadlineBadge";
import { Btn, Select } from "@/src/components/Form";
import { FormSheet } from "@/src/components/FormSheet";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function OrdenDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [orden, setOrden] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [asignarOpen, setAsignarOpen] = useState(false);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [selectedTec, setSelectedTec] = useState("");
  const [asignando, setAsignando] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.get(`/ordenes/${id}`);
      setOrden(r.data);
    } catch (e: any) {
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

  const openAsignar = async () => {
    setSelectedTec(orden?.tecnico_id || "");
    setAsignarOpen(true);
    try {
      const r = await api.get("/admin/tecnicos");
      setTecnicos(r.data);
    } catch {
      setTecnicos([]);
    }
  };

  const onAsignar = async () => {
    if (!selectedTec) {
      showToast("Selecciona un técnico", "error");
      return;
    }
    setAsignando(true);
    try {
      const r = await api.patch(`/admin/ordenes/${id}/asignar`, {
        tecnico_id: selectedTec,
      });
      const wa = r.data?.whatsapp;
      if (wa?.mode === "sent") {
        showToast("Técnico asignado · WhatsApp enviado ✓", "success");
      } else if (wa?.mode === "fallback_link") {
        showToast("Técnico asignado · Abre WhatsApp manualmente", "info");
      } else if (wa?.mode === "no_phone") {
        showToast("Asignado, pero técnico sin teléfono", "info");
      } else {
        showToast("Técnico asignado", "success");
      }
      setAsignarOpen(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setAsignando(false);
    }
  };

  const [reenviando, setReenviando] = useState(false);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);
  // Editar fechas
  const [editFechaOpen, setEditFechaOpen] = useState(false);
  const [fechaEjecValue, setFechaEjecValue] = useState("");
  const [fechaLimValue, setFechaLimValue] = useState("");
  const [savingFechas, setSavingFechas] = useState(false);

  const saveFechas = async () => {
    setSavingFechas(true);
    try {
      const payload: any = {};
      if (fechaEjecValue !== (orden?.fecha_ejecucion || "")) {
        payload.fecha_ejecucion = fechaEjecValue || null;
      }
      if (fechaLimValue !== (orden?.fecha_limite || "")) {
        payload.fecha_limite = fechaLimValue || null;
      }
      if (Object.keys(payload).length === 0) {
        setEditFechaOpen(false);
        return;
      }
      const r = await api.patch(`/admin/ordenes/${id}`, payload);
      setOrden(r.data);
      setEditFechaOpen(false);
      showToast("Fechas actualizadas", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSavingFechas(false);
    }
  };
  const onReenviarWhatsApp = async () => {
    if (reenviando) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `¿Reenviar esta orden por WhatsApp al técnico${
          orden?.tecnico ? ` ${orden.tecnico.nombre} ${orden.tecnico.apellidos}` : ""
        }?`
      );
      if (!ok) return;
    }
    setReenviando(true);
    try {
      const r = await api.post(`/admin/ordenes/${id}/reenviar-whatsapp`);
      const wa = r.data?.whatsapp;
      if (wa?.mode === "sent") {
        showToast("WhatsApp reenviado correctamente ✓", "success");
      } else if (wa?.mode === "fallback_link" || (wa?.mode === "error" && wa?.wa_link)) {
        showToast("Mensaje preparado · Abre WhatsApp manualmente", "info");
      } else if (wa?.mode === "no_phone") {
        showToast("El técnico no tiene teléfono registrado", "error");
      } else {
        showToast("Error al reenviar WhatsApp", "error");
      }
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error al reenviar", "error");
    } finally {
      setReenviando(false);
    }
  };

  const onDelete = async () => {
    try {
      await api.delete(`/admin/ordenes/${id}`);
      showToast("Orden eliminada", "success");
      router.back();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error eliminando", "error");
    }
  };

  const openWaze = () => {
    const dir = encodeURIComponent(orden?.sucursal?.direccion || "");
    Linking.openURL(`https://waze.com/ul?q=${dir}`);
  };

  const openMaps = () => {
    const dir = encodeURIComponent(orden?.sucursal?.direccion || "");
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${dir}`);
  };

  const openWaLink = () => {
    if (orden?.whatsapp_last?.wa_link) {
      Linking.openURL(orden.whatsapp_last.wa_link);
    }
  };

  const downloadPdf = async () => {
    try {
      const token = await (await import("@/src/utils/storage")).storage.secureGet<string>(
        "mvg_token",
        ""
      );
      const url = `${(await import("@/src/api/client")).API_BASE}/admin/ordenes/${id}/pdf`;
      const filename = `orden_${orden.numero}.pdf`;
      if (typeof window !== "undefined" && (window as any).fetch) {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          showToast("Error al generar PDF", "error");
          return;
        }
        const blob = await res.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("PDF descargado", "success");
      } else {
        Linking.openURL(`${url}?token=${token}`);
      }
    } catch (e: any) {
      showToast(String(e?.message || e), "error");
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
            <DeadlineBadge fechaLimite={orden.fecha_limite} size="md" />
          </View>
          <Text style={styles.titulo}>{orden.titulo}</Text>
        </View>

        <Section title="Equipo">
          <Row icon="pricetag-outline" label="Código comercio (CC)" value={orden.sucursal?.codigo_comercio} highlight />
          {orden.pin_pads && orden.pin_pads.length > 0 ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              <Text style={styles.subTitle}>
                {orden.pin_pads.length} Pin Pad{orden.pin_pads.length === 1 ? "" : "s"} ·{" "}
                {orden.pin_pads.filter((p: any) => p.completed).length} actualizado{orden.pin_pads.filter((p: any) => p.completed).length === 1 ? "" : "s"}
              </Text>
              {orden.pin_pads.map((pp: any, idx: number) => (
                <View key={pp.id} style={styles.ppItem} testID={`admin-pp-${pp.id}`}>
                  <View style={styles.ppItemHead}>
                    <Text style={styles.ppItemNum}>#{idx + 1}</Text>
                    {pp.completed ? (
                      <Ionicons name="checkmark-circle" size={18} color={colors.completed} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={18} color={colors.textMuted} />
                    )}
                  </View>
                  <Text style={styles.ppDdll}>DDLL: {pp.ddll || "—"}</Text>
                  <Text style={styles.ppSerie}>Serie: {pp.serie || "—"}{pp.modelo ? ` · ${pp.modelo}` : ""}</Text>
                  {pp.completed && pp.completed_at ? (
                    <Text style={styles.ppMeta}>
                      ✓ {new Date(pp.completed_at).toLocaleString("es-CL")}
                    </Text>
                  ) : null}
                  {pp.completed && (pp.foto_antes_base64 || pp.foto_descarga_master_base64 || pp.foto_despues_base64 || pp.foto_comprobante_venta_base64) ? (
                    <View style={{ gap: 6 }}>
                      {[
                        { src: pp.foto_antes_base64, label: "1. Antes" },
                        { src: pp.foto_descarga_master_base64, label: "2. Descarga Master" },
                        { src: pp.foto_despues_base64, label: "3. Después" },
                        { src: pp.foto_comprobante_venta_base64, label: "4. Comprobante venta" },
                      ].filter((x) => !!x.src).map((x, i) => (
                        <View key={i} style={{ gap: 2 }}>
                          <Text style={styles.ppPhotoLabel}>{x.label}</Text>
                          <TouchableOpacity
                            onPress={() => setLightboxUri(x.src)}
                            activeOpacity={0.8}
                            testID={`pp-foto-${pp.id}-${i}`}
                          >
                            <Image source={{ uri: x.src }} style={styles.ppThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  ) : pp.completed && pp.evidencia_base64 ? (
                    <TouchableOpacity
                      onPress={() => setLightboxUri(pp.evidencia_base64)}
                      activeOpacity={0.8}
                      testID={`pp-foto-${pp.id}`}
                    >
                      <Image
                        source={{ uri: pp.evidencia_base64 }}
                        style={styles.ppThumb}
                        resizeMode="cover"
                      />
                      <View style={styles.ppExpandHint}>
                        <Ionicons name="expand-outline" size={12} color="#fff" />
                        <Text style={styles.ppExpandTxt}>Ver tamaño completo</Text>
                      </View>
                    </TouchableOpacity>
                  ) : null}
                  {pp.notas ? <Text style={styles.ppNotas}>📝 {pp.notas}</Text> : null}
                  {pp.completed && (
                    <View style={styles.ppMatBox} testID={`admin-pp-materiales-${pp.id}`}>
                      <View style={styles.ppMatHead}>
                        <Ionicons name="cube-outline" size={14} color={colors.primary} />
                        <Text style={styles.ppMatTitle}>
                          Suministros utilizados
                        </Text>
                      </View>
                      {pp.materiales_usados && pp.materiales_usados.length > 0 ? (
                        <View style={{ gap: 4 }}>
                          {pp.materiales_usados.map((m: any, i: number) => (
                            <View key={i} style={styles.ppMatRow}>
                              <Text style={styles.ppMatSku}>{m.sku}</Text>
                              <Text style={styles.ppMatDesc} numberOfLines={1}>
                                {m.descripcion || "—"}
                              </Text>
                              <Text style={styles.ppMatQty}>×{m.cantidad}</Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.ppMatNone}>
                          ✓ No se utilizaron suministros
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <>
              <Row icon="barcode-outline" label="Serie" value={orden.serie} />
              <Row icon="hardware-chip-outline" label="Modelo" value={orden.modelo} />
              <Row icon="server-outline" label="DDLL" value={orden.ddll} />
            </>
          )}
        </Section>

        <Section title="Comercio">
          {orden.sucursal?.codigo_comercio && (
            <Row icon="pricetag-outline" label="Código comercio" value={orden.sucursal.codigo_comercio} highlight />
          )}
          {orden.cliente?.rut && (
            <Row icon="card-outline" label="RUT" value={orden.cliente.rut} />
          )}
          {orden.cliente?.nombre && (
            <Row icon="business-outline" label="Razón social" value={orden.cliente.nombre} />
          )}
          {orden.cliente?.nombre_fantasia && (
            <Row icon="storefront-outline" label="Nombre fantasía" value={orden.cliente.nombre_fantasia} />
          )}
        </Section>

        <Section title="Ubicación">
          <Row
            icon="location-outline"
            label="Dirección"
            value={orden.sucursal?.direccion}
          />
          {orden.sucursal?.comuna && (
            <Row icon="map-outline" label="Comuna" value={orden.sucursal.comuna} />
          )}
          {orden.sucursal?.region && (
            <Row icon="globe-outline" label="Región" value={orden.sucursal.region} />
          )}
          {orden.sucursal?.direccion && (
            <View style={styles.mapBtns}>
              <TouchableOpacity
                testID="open-waze-btn"
                style={[styles.mapBtn, { backgroundColor: "#33CCFF" }]}
                onPress={openWaze}
              >
                <Ionicons name="navigate" size={16} color="#fff" />
                <Text style={styles.mapBtnText}>Waze</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="open-maps-btn"
                style={[styles.mapBtn, { backgroundColor: "#4285F4" }]}
                onPress={openMaps}
              >
                <Ionicons name="map" size={16} color="#fff" />
                <Text style={styles.mapBtnText}>Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}
        </Section>

        <Section title="Técnico asignado">
          {orden.tecnico ? (
            <>
              <Row
                icon="person-circle-outline"
                label="Nombre"
                value={`${orden.tecnico.nombre} ${orden.tecnico.apellidos}`}
              />
              {orden.tecnico.email && (
                <Row icon="mail-outline" label="Email" value={orden.tecnico.email} />
              )}
              {orden.tecnico.telefono && (
                <Row
                  icon="call-outline"
                  label="Teléfono"
                  value={orden.tecnico.telefono}
                />
              )}
              {orden.whatsapp_last && (
                <View style={styles.waBox}>
                  <Ionicons
                    name="logo-whatsapp"
                    size={16}
                    color={colors.completed}
                  />
                  <Text style={styles.waText}>
                    WhatsApp:{" "}
                    {orden.whatsapp_last.mode === "sent"
                      ? "enviado ✓"
                      : orden.whatsapp_last.mode === "fallback_link"
                      ? "link disponible"
                      : orden.whatsapp_last.mode === "no_phone"
                      ? "sin teléfono"
                      : "error"}
                  </Text>
                  {orden.whatsapp_last.wa_link && (
                    <TouchableOpacity
                      testID="abrir-wa-link"
                      onPress={openWaLink}
                      style={styles.waLinkBtn}
                    >
                      <Text style={styles.waLinkText}>Abrir WhatsApp</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.muted}>Sin técnico asignado</Text>
          )}

          <Btn
            title={orden.tecnico ? "Reasignar técnico" : "Asignar técnico"}
            variant={orden.tecnico ? "outline" : "primary"}
            onPress={openAsignar}
            testID="asignar-tecnico-btn"
            icon={
              <Ionicons
                name={orden.tecnico ? "refresh" : "person-add"}
                size={18}
                color="#fff"
              />
            }
          />

          {orden.tecnico && (
            <TouchableOpacity
              testID="reenviar-whatsapp-btn"
              onPress={onReenviarWhatsApp}
              disabled={reenviando}
              activeOpacity={0.85}
              style={[styles.waResendBtn, reenviando && { opacity: 0.6 }]}
            >
              {reenviando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                  <Text style={styles.waResendText}>Reenviar Orden al WhatsApp</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </Section>

        <Section title="Descripción">
          <Text style={styles.descripcion}>{orden.descripcion}</Text>
        </Section>

        {/* CUE Section visible al admin */}
        {orden.cue_base64 && (
          <Section title="CUE (Comprobante Único)">
            <TouchableOpacity
              onPress={() => setLightboxUri(orden.cue_base64)}
              activeOpacity={0.8}
              testID="cue-foto-admin"
            >
              <Image
                source={{ uri: orden.cue_base64 }}
                style={styles.cueImg}
                resizeMode="cover"
              />
              <View style={styles.ppExpandHint}>
                <Ionicons name="expand-outline" size={12} color="#fff" />
                <Text style={styles.ppExpandTxt}>Ver tamaño completo</Text>
              </View>
            </TouchableOpacity>
            {orden.cue_uploaded_at && (
              <Text style={styles.cueMeta}>
                📅 Subido: {new Date(orden.cue_uploaded_at).toLocaleString("es-CL")}
              </Text>
            )}
          </Section>
        )}

        <Section title="Fechas">
          <Row
            icon="calendar-outline"
            label="Fecha límite"
            value={orden.fecha_limite || "Sin definir"}
          />
          <Row
            icon="time-outline"
            label="Fecha de ejecución"
            value={orden.fecha_ejecucion || "Sin definir"}
          />
          <TouchableOpacity
            style={styles.editFechaBtn}
            onPress={() => {
              setFechaEjecValue(orden.fecha_ejecucion || "");
              setFechaLimValue(orden.fecha_limite || "");
              setEditFechaOpen(true);
            }}
            testID="editar-fechas-btn"
          >
            <Ionicons name="create-outline" size={14} color={colors.primary} />
            <Text style={styles.editFechaText}>Editar fechas</Text>
          </TouchableOpacity>
        </Section>

        <Section title="Historial">
          <Row
            icon="calendar-outline"
            label="Creada"
            value={new Date(orden.created_at).toLocaleString("es-CL")}
          />
          {orden.started_at && (
            <Row
              icon="play-outline"
              label="Iniciada"
              value={new Date(orden.started_at).toLocaleString("es-CL")}
            />
          )}
          {orden.finalized_at && (
            <Row
              icon="checkmark-done-outline"
              label="Finalizada"
              value={new Date(orden.finalized_at).toLocaleString("es-CL")}
            />
          )}
        </Section>

        {orden.estado === "finalizada" && (
          <Section title="Evidencia del trabajo">
            {orden.evidencia_base64 ? (
              <Image
                source={{ uri: orden.evidencia_base64 }}
                style={styles.evidencia}
                resizeMode="cover"
                testID="orden-evidencia-img"
              />
            ) : (
              <Text style={styles.muted}>Sin evidencia</Text>
            )}
            {orden.notas_tecnico ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>Notas del técnico</Text>
                <Text style={styles.notes}>{orden.notas_tecnico}</Text>
              </View>
            ) : null}

            {orden.closed_lat && orden.closed_lng ? (
              <View style={{ marginTop: spacing.md }}>
                <Text style={styles.notesLabel}>📍 Ubicación de cierre</Text>
                {orden.finalized_at && (
                  <Text style={styles.muted}>
                    Cerrada el{" "}
                    {new Date(orden.finalized_at).toLocaleString("es-CL", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                )}
                <View style={{ marginTop: spacing.sm }}>
                  <LocationMap
                    lat={orden.closed_lat}
                    lng={orden.closed_lng}
                    address={orden.closed_address}
                    accuracy={orden.closed_accuracy_m}
                    height={360}
                    testID="orden-close-map"
                  />
                </View>
              </View>
            ) : null}
          </Section>
        )}

        <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
          <Btn
            title="Descargar PDF"
            variant="accent"
            onPress={downloadPdf}
            testID="descargar-pdf-btn"
            icon={<Ionicons name="document-text" size={18} color="#fff" />}
          />
          <Btn
            title="Eliminar orden"
            variant="danger"
            onPress={onDelete}
            testID="eliminar-orden-btn"
            icon={<Ionicons name="trash-outline" size={18} color="#fff" />}
          />
        </View>
      </ScrollView>

      <FormSheet
        visible={asignarOpen}
        onClose={() => setAsignarOpen(false)}
        title={orden.tecnico ? "Reasignar técnico" : "Asignar técnico"}
        testID="asignar-sheet"
      >
        <Text style={styles.helpText}>
          El técnico recibirá una notificación por WhatsApp al teléfono registrado.
        </Text>
        <Select
          label="Técnico"
          value={selectedTec}
          onChange={setSelectedTec}
          options={tecnicos.map((t) => ({
            label: `${t.nombre} ${t.apellidos} · ${t.telefono || "sin tel"}`,
            value: t.id,
          }))}
          testID="asignar-select"
        />
        <Btn
          title="Asignar y notificar"
          onPress={onAsignar}
          loading={asignando}
          variant="accent"
          testID="asignar-confirmar"
          icon={<Ionicons name="logo-whatsapp" size={18} color="#fff" />}
        />
      </FormSheet>

      {/* Editar fechas */}
      <FormSheet
        visible={editFechaOpen}
        onClose={() => setEditFechaOpen(false)}
        title="Editar fechas"
        testID="edit-fecha-sheet"
      >
        <Text style={styles.fieldLabel}>Fecha de ejecución (YYYY-MM-DD)</Text>
        <TextInput
          value={fechaEjecValue}
          onChangeText={setFechaEjecValue}
          placeholder="2026-07-15"
          placeholderTextColor={colors.textDim}
          style={styles.fechaInput}
          testID="fecha-ejecucion-input"
        />
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
          Fecha límite (YYYY-MM-DD)
        </Text>
        <TextInput
          value={fechaLimValue}
          onChangeText={setFechaLimValue}
          placeholder="2026-07-30"
          placeholderTextColor={colors.textDim}
          style={styles.fechaInput}
          testID="fecha-limite-input"
        />
        <TouchableOpacity
          style={styles.saveFechasBtn}
          onPress={saveFechas}
          disabled={savingFechas}
          testID="guardar-fechas-btn"
        >
          {savingFechas ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
          )}
          <Text style={styles.saveFechasText}>
            {savingFechas ? "Guardando…" : "Guardar fechas"}
          </Text>
        </TouchableOpacity>
      </FormSheet>

      {/* Photo Lightbox - vista a tamaño completo */}
      <Modal
        visible={!!lightboxUri}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxUri(null)}
      >
        <TouchableOpacity
          style={styles.lightboxBg}
          activeOpacity={1}
          onPress={() => setLightboxUri(null)}
        >
          <View style={styles.lightboxHeader}>
            <TouchableOpacity
              onPress={() => setLightboxUri(null)}
              style={styles.lightboxClose}
              testID="lightbox-close"
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          {lightboxUri && (
            <Image
              source={{ uri: lightboxUri }}
              style={styles.lightboxImg}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>

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

const Row: React.FC<{ icon: any; label: string; value?: string; highlight?: boolean }> = ({
  icon,
  label,
  value,
  highlight,
}) => (
  <View style={styles.detailRow}>
    <View style={[styles.detailIcon, highlight && { backgroundColor: `${colors.accent}33` }]}>
      <Ionicons name={icon} size={16} color={colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && { color: colors.accent, fontWeight: "800", fontSize: fontSize.md }]}>
        {value || "—"}
      </Text>
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
  badges: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
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
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  notesBox: { marginTop: spacing.md, gap: 6 },
  notesLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  notes: { color: colors.textMain, fontSize: fontSize.sm, lineHeight: 20 },
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
  waBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: spacing.md,
    backgroundColor: "rgba(16,185,129,0.1)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.3)",
    flexWrap: "wrap",
  },
  waText: { color: colors.textMain, fontSize: fontSize.sm, flex: 1 },
  waLinkBtn: {
    backgroundColor: colors.completed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  waLinkText: { color: "#fff", fontSize: fontSize.xs, fontWeight: "700" },
  helpText: { color: colors.textMuted, fontSize: fontSize.sm },
  subTitle: {
    color: colors.accent,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  ppItem: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ppItemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ppItemNum: { color: colors.textMuted, fontWeight: "700", fontSize: fontSize.xs },
  ppDdll: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.sm },
  ppSerie: { color: colors.textMuted, fontSize: fontSize.xs },
  ppMeta: { color: colors.completed, fontSize: fontSize.xs, fontWeight: "600" },
  ppNotas: { color: colors.textMuted, fontSize: fontSize.xs, fontStyle: "italic" },
  ppMatBox: {
    marginTop: 4,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 4,
  },
  ppMatHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ppMatTitle: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  ppMatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 2,
  },
  ppMatSku: {
    color: colors.accent,
    fontFamily: "monospace" as any,
    fontWeight: "700",
    fontSize: fontSize.xs,
    minWidth: 60,
  },
  ppMatDesc: {
    color: colors.textMain,
    fontSize: fontSize.xs,
    flex: 1,
  },
  ppMatQty: {
    color: colors.completed,
    fontWeight: "800",
    fontSize: fontSize.sm,
  },
  ppMatNone: {
    color: colors.completed,
    fontSize: fontSize.xs,
    fontStyle: "italic",
  },
  ppThumb: {
    width: "100%",
    height: 140,
    borderRadius: radius.sm,
    marginTop: 4,
    backgroundColor: colors.surface,
  },
  ppExpandHint: {
    position: "absolute",
    bottom: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ppExpandTxt: { color: "#fff", fontSize: 10, fontWeight: "600" },
  ppPhotoLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" },
  cueImg: {
    width: "100%",
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  cueMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 6 },
  editFechaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    marginTop: 8,
  },
  editFechaText: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  fieldLabel: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.sm, marginBottom: 4 },
  fechaInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: fontSize.md,
    color: colors.textMain,
  },
  saveFechasBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 16,
  },
  saveFechasText: { color: "#fff", fontWeight: "800" },
  lightboxBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxHeader: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 2,
  },
  lightboxClose: {
    width: 44,
    height: 44,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImg: {
    width: "100%",
    height: "100%",
  },

  waResendBtn: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: "#25D366", // WhatsApp green
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  waResendText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
});
