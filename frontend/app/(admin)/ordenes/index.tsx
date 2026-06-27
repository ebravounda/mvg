import { useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { api, API_BASE } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { DeadlineBadge } from "@/src/components/DeadlineBadge";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Select, Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { useResponsive } from "@/src/hooks/useResponsive";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";

const FILTERS = [
  { label: "Todas", value: "" },
  { label: "Sin asignar", value: "sin_asignar" },
  { label: "Pendientes", value: "pendiente" },
  { label: "En progreso", value: "en_progreso" },
  { label: "Finalizadas", value: "finalizada" },
];

export default function OrdenesList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ action?: string }>();
  const { isDesktop } = useResponsive();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"fecha" | "comuna" | "sucursal" | "cc">(
    "fecha"
  );

  // Create sheet
  const [createSheet, setCreateSheet] = useState(false);
  const [clientes, setClientes] = useState<any[]>([]);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [form, setForm] = useState<any>({
    cliente_id: "",
    sucursal_id: "",
    tecnico_id: "",
    titulo: "",
    descripcion: "",
    prioridad: "media",
    serie: "",
    modelo: "",
    ddll: "",
    fecha_limite: "",
  });
  const [saving, setSaving] = useState(false);

  // Upload sheet
  const [uploadSheet, setUploadSheet] = useState(false);
  const [uploadFile, setUploadFile] = useState<any>(null);
  const [uploadPrioridad, setUploadPrioridad] = useState("media");
  const [uploadFecha, setUploadFecha] = useState("");
  const [uploading, setUploading] = useState(false);

  // Actions menu
  const [actionsOpen, setActionsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      let url = "/admin/ordenes";
      if (filter && filter !== "sin_asignar") {
        url += `?estado=${filter}`;
      }
      const r = await api.get(url);
      let data = r.data;
      if (filter === "sin_asignar") {
        data = data.filter((o: any) => !o.tecnico_id);
      }
      setItems(data);
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

  useEffect(() => {
    if (params?.action === "upload") {
      setUploadFile(null);
      setUploadFecha("");
      setUploadPrioridad("media");
      setUploadSheet(true);
      // clear param so it doesn't re-open
      router.setParams({ action: "" } as any);
    }
  }, [params?.action, router]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter((o) => {
        const blob = [
          o.numero,
          o.sucursal?.codigo_comercio,
          o.sucursal?.direccion,
          o.sucursal?.comuna,
          o.sucursal?.region,
          o.sucursal?.nombre,
          o.cliente?.nombre,
          o.cliente?.nombre_fantasia,
          o.titulo,
          o.tecnico ? `${o.tecnico.nombre} ${o.tecnico.apellidos}` : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return blob.includes(q);
      });
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      const av = (() => {
        if (sortBy === "comuna") return (a.sucursal?.comuna || "").toLowerCase();
        if (sortBy === "sucursal")
          return (a.sucursal?.nombre || a.sucursal?.codigo_comercio || "").toLowerCase();
        if (sortBy === "cc") return (a.sucursal?.codigo_comercio || "").toLowerCase();
        return a.created_at || "";
      })();
      const bv = (() => {
        if (sortBy === "comuna") return (b.sucursal?.comuna || "").toLowerCase();
        if (sortBy === "sucursal")
          return (b.sucursal?.nombre || b.sucursal?.codigo_comercio || "").toLowerCase();
        if (sortBy === "cc") return (b.sucursal?.codigo_comercio || "").toLowerCase();
        return b.created_at || "";
      })();
      if (sortBy === "fecha") return bv.localeCompare(av); // desc by date
      return av.localeCompare(bv);
    });
    return sorted;
  }, [items, query, sortBy]);

  const openCreate = async () => {
    setActionsOpen(false);
    setForm({
      cliente_id: "",
      sucursal_id: "",
      tecnico_id: "",
      titulo: "",
      descripcion: "",
      prioridad: "media",
      serie: "",
      modelo: "",
      ddll: "",
      fecha_limite: "",
    });
    setCreateSheet(true);
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
    setForm((f: any) => ({ ...f, cliente_id, sucursal_id: "" }));
    try {
      const r = await api.get(`/admin/sucursales?cliente_id=${cliente_id}`);
      setSucursales(r.data);
    } catch {
      setSucursales([]);
    }
  };

  const onSaveCreate = async () => {
    if (
      !form.cliente_id ||
      !form.sucursal_id ||
      !form.titulo ||
      !form.descripcion
    ) {
      showToast("Completa cliente, comercio, título y descripción", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.tecnico_id) delete payload.tecnico_id;
      if (!payload.fecha_limite) delete payload.fecha_limite;
      ["serie", "modelo", "ddll"].forEach((k) => {
        if (!payload[k]) delete payload[k];
      });
      await api.post("/admin/ordenes", payload);
      showToast("Orden creada", "success");
      setCreateSheet(false);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSaving(false);
    }
  };

  const openUpload = () => {
    setActionsOpen(false);
    setUploadFile(null);
    setUploadFecha("");
    setUploadPrioridad("media");
    setUploadSheet(true);
  };

  const pickExcel = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "*/*",
      ],
      copyToCacheDirectory: true,
    });
    if (!res.canceled && res.assets?.[0]) {
      setUploadFile(res.assets[0]);
    }
  };

  const onUpload = async () => {
    if (!uploadFile) {
      showToast("Selecciona un archivo Excel", "error");
      return;
    }
    setUploading(true);
    try {
      const token = await storage.secureGet<string>("mvg_token", "");
      const fd = new FormData();
      if (Platform.OS === "web" && uploadFile.file) {
        fd.append("file", uploadFile.file);
      } else {
        fd.append("file", {
          uri: uploadFile.uri,
          name: uploadFile.name || "base.xlsx",
          type:
            uploadFile.mimeType ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        } as any);
      }
      if (uploadFecha) fd.append("fecha_limite", uploadFecha);
      fd.append("prioridad", uploadPrioridad);

      const res = await fetch(`${API_BASE}/admin/ordenes/upload-excel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.detail || "Error al cargar", "error");
        return;
      }
      showToast(
        `${data.ordenes_creadas} órdenes · ${data.comercios_creados} comercios · ${data.clientes_creados} clientes`,
        "success"
      );
      setUploadSheet(false);
      load();
    } catch (e: any) {
      showToast(String(e?.message || e), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader
        title="Órdenes"
        subtitle="Gestiona y asigna órdenes de servicio"
        rightSlot={
          isDesktop ? (
            <TouchableOpacity
              testID="abrir-acciones-btn"
              onPress={() => setActionsOpen(true)}
              style={styles.headerCtaDesktop}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.headerCtaText}>Nueva orden</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="abrir-acciones-btn"
              onPress={() => setActionsOpen(true)}
              style={styles.headerCta}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )
        }
      />

      {isDesktop ? (
        // ===== Desktop unified toolbar =====
        <View style={styles.toolbarDesktop}>
          <View style={styles.filterPillsRow}>
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
          </View>

          <View style={styles.toolbarBottomRow}>
            <View style={styles.searchBoxDesktop}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                testID="ordenes-search"
                value={query}
                onChangeText={setQuery}
                placeholder="Buscar por CC, dirección, comuna, técnico..."
                placeholderTextColor={colors.textDim}
                style={styles.searchInput}
                autoCapitalize="none"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.sortInlineRow}>
              <Text style={styles.sortLabel}>Ordenar:</Text>
              {[
                { l: "Fecha", v: "fecha" },
                { l: "Comuna", v: "comuna" },
                { l: "Sucursal", v: "sucursal" },
                { l: "CC", v: "cc" },
              ].map((s) => {
                const active = sortBy === s.v;
                return (
                  <TouchableOpacity
                    key={s.v}
                    testID={`sort-${s.v}`}
                    onPress={() => setSortBy(s.v as any)}
                    style={[
                      styles.sortChip,
                      active && {
                        backgroundColor: `${colors.accent}22`,
                        borderColor: colors.accent,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sortChipText,
                        active && { color: colors.accent, fontWeight: "700" },
                      ]}
                    >
                      {s.l}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : (
        <>
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
                  testID={`filter-${f.value || "all"}-m`}
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

          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              testID="ordenes-search-m"
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por CC, dirección, comuna, técnico..."
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery("")}>
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortRow}
            style={styles.sortScroll}
          >
            <Text style={styles.sortLabel}>Ordenar:</Text>
            {[
              { l: "Fecha", v: "fecha" },
              { l: "Comuna", v: "comuna" },
              { l: "Sucursal", v: "sucursal" },
              { l: "CC", v: "cc" },
            ].map((s) => {
              const active = sortBy === s.v;
              return (
                <TouchableOpacity
                  key={s.v}
                  testID={`sort-${s.v}-m`}
                  onPress={() => setSortBy(s.v as any)}
                  style={[
                    styles.sortChip,
                    active && {
                      backgroundColor: `${colors.accent}33`,
                      borderColor: colors.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      active && { color: colors.accent, fontWeight: "700" },
                    ]}
                  >
                    {s.l}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </>
      )}


      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
      ) : isDesktop ? (
        <ScrollView
          contentContainerStyle={{ padding: 32, paddingTop: 20 }}
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
          <View style={styles.tableSummary}>
            <Text style={styles.tableSummaryText}>
              {filteredItems.length} {filteredItems.length === 1 ? "orden" : "órdenes"}
            </Text>
          </View>
          <View style={styles.tableCard}>
            <View style={styles.tableHeadRow}>
              <Text style={[styles.thText, { flex: 1.1 }]}>Orden</Text>
              <Text style={[styles.thText, { flex: 1.8 }]}>Cliente / Título</Text>
              <Text style={[styles.thText, { flex: 1.3 }]}>Comercio</Text>
              <Text style={[styles.thText, { flex: 1.2 }]}>Técnico</Text>
              <Text style={[styles.thText, { width: 100 }]}>Prioridad</Text>
              <Text style={[styles.thText, { width: 120 }]}>Estado</Text>
              <Text style={[styles.thText, { width: 120 }]}>Plazo</Text>
            </View>
            {filteredItems.length === 0 ? (
              <View style={styles.tableEmpty}>
                <Ionicons name="clipboard-outline" size={36} color={colors.textDim} />
                <Text style={styles.emptyTxt}>No hay órdenes</Text>
              </View>
            ) : (
              filteredItems.map((o, idx) => (
                <TouchableOpacity
                  key={o.id}
                  testID={`orden-card-${o.id}`}
                  style={[
                    styles.tableRow,
                    idx === filteredItems.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => router.push(`/(admin)/ordenes/${o.id}`)}
                  activeOpacity={0.6}
                >
                  <View style={{ flex: 1.1 }}>
                    <Text style={styles.tdNumero}>{o.numero}</Text>
                  </View>
                  <View style={{ flex: 1.8, paddingRight: 8 }}>
                    <Text style={styles.tdTitle} numberOfLines={1}>
                      {o.titulo}
                    </Text>
                    <Text style={styles.tdMeta} numberOfLines={1}>
                      {o.cliente?.nombre_fantasia || o.cliente?.nombre}
                    </Text>
                  </View>
                  <View style={{ flex: 1.3, paddingRight: 8 }}>
                    {o.sucursal?.codigo_comercio ? (
                      <>
                        <Text style={styles.tdCC} numberOfLines={1}>
                          CC {o.sucursal.codigo_comercio}
                        </Text>
                        <Text style={styles.tdMeta} numberOfLines={1}>
                          {o.sucursal.comuna || o.sucursal.direccion || ""}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.tdMeta}>—</Text>
                    )}
                  </View>
                  <View style={{ flex: 1.2, paddingRight: 8 }}>
                    <Text
                      style={[
                        styles.tdTec,
                        !o.tecnico && { color: colors.pending, fontWeight: "700" },
                      ]}
                      numberOfLines={1}
                    >
                      {o.tecnico
                        ? `${o.tecnico.nombre} ${o.tecnico.apellidos}`
                        : "Sin asignar"}
                    </Text>
                  </View>
                  <View style={{ width: 100 }}>
                    <PriorityBadge priority={o.prioridad} />
                  </View>
                  <View style={{ width: 120 }}>
                    <StatusBadge status={o.estado} />
                  </View>
                  <View style={{ width: 120 }}>
                    <DeadlineBadge fechaLimite={o.fecha_limite} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={filteredItems}
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
                Toca el botón + para crear o cargar desde Excel
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
                  {o.cliente?.nombre_fantasia || o.cliente?.nombre}
                </Text>
              </View>
              {o.sucursal?.codigo_comercio && (
                <View style={styles.row}>
                  <Ionicons
                    name="pricetag-outline"
                    size={14}
                    color={colors.accent}
                  />
                  <Text style={[styles.meta, { color: colors.accent }]}>
                    CC {o.sucursal.codigo_comercio}
                  </Text>
                  {o.serie ? (
                    <Text style={styles.meta} numberOfLines={1}>
                      · Serie {o.serie}
                    </Text>
                  ) : null}
                </View>
              )}
              <View style={styles.row}>
                <Ionicons
                  name="person-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text
                  style={[
                    styles.meta,
                    !o.tecnico && { color: colors.pending, fontWeight: "700" },
                  ]}
                  numberOfLines={1}
                >
                  {o.tecnico
                    ? `${o.tecnico.nombre} ${o.tecnico.apellidos}`
                    : "Sin asignar — toca para asignar"}
                </Text>
              </View>
              <View style={styles.cardFoot}>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <PriorityBadge priority={o.prioridad} />
                  <DeadlineBadge fechaLimite={o.fecha_limite} />
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Actions chooser */}
      <FormSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title="Nueva orden"
        testID="acciones-sheet"
      >
        <TouchableOpacity
          testID="accion-cargar-excel"
          style={styles.actionItem}
          onPress={openUpload}
        >
          <View style={[styles.actionIcon, { backgroundColor: `${colors.accent}22` }]}>
            <Ionicons name="document-attach" size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Cargar desde Excel</Text>
            <Text style={styles.actionSub}>
              Importa órdenes masivamente desde planilla
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="accion-crear-manual"
          style={styles.actionItem}
          onPress={openCreate}
        >
          <View style={[styles.actionIcon, { backgroundColor: `${colors.primary}22` }]}>
            <Ionicons name="create" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Crear orden manual</Text>
            <Text style={styles.actionSub}>
              Crear una orden de servicio individual
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </FormSheet>

      {/* Upload Excel sheet */}
      <FormSheet
        visible={uploadSheet}
        onClose={() => setUploadSheet(false)}
        title="Cargar órdenes desde Excel"
        testID="upload-excel-sheet"
      >
        <Text style={styles.help}>
          Selecciona un archivo Excel con la pestaña CC (columnas: RUT,
          NOM_RAZON_SOCIAL, NOM_FANTASIA, CC, DIRECCION, COMUNA, #REGION,
          M_MODELO, SERIEPI, DDLL).
        </Text>

        <TouchableOpacity
          testID="picker-excel"
          style={[
            styles.filePicker,
            uploadFile && { borderColor: colors.primary },
          ]}
          onPress={pickExcel}
        >
          <Ionicons
            name={uploadFile ? "checkmark-circle" : "cloud-upload-outline"}
            size={32}
            color={uploadFile ? colors.completed : colors.accent}
          />
          <Text style={styles.fileText}>
            {uploadFile ? uploadFile.name : "Toca para seleccionar Excel"}
          </Text>
          {uploadFile && (
            <Text style={styles.fileSub}>
              {Math.round((uploadFile.size || 0) / 1024)} KB · Toca para cambiar
            </Text>
          )}
        </TouchableOpacity>

        <Field
          label="Fecha límite (opcional, YYYY-MM-DD)"
          value={uploadFecha}
          onChangeText={setUploadFecha}
          placeholder="2026-07-31"
          autoCapitalize="none"
          testID="upload-fecha"
        />

        <Select
          label="Prioridad para todas"
          value={uploadPrioridad}
          onChange={setUploadPrioridad}
          options={[
            { label: "Baja", value: "baja" },
            { label: "Media", value: "media" },
            { label: "Alta", value: "alta" },
          ]}
          testID="upload-prioridad"
        />

        <Btn
          title="Cargar archivo"
          onPress={onUpload}
          loading={uploading}
          disabled={!uploadFile}
          variant="accent"
          testID="upload-submit"
          icon={<Ionicons name="cloud-upload" size={18} color="#fff" />}
        />
      </FormSheet>

      {/* Manual create sheet */}
      <FormSheet
        visible={createSheet}
        onClose={() => setCreateSheet(false)}
        title="Nueva orden de servicio"
        testID="nueva-orden-sheet"
      >
        <Select
          label="Cliente *"
          value={form.cliente_id}
          onChange={onSelectCliente}
          options={clientes.map((c) => ({
            label: c.nombre_fantasia || c.nombre,
            value: c.id,
          }))}
          testID="orden-cliente"
        />
        {form.cliente_id && (
          <Select
            label="Comercio (CC) *"
            value={form.sucursal_id}
            onChange={(v) => setForm({ ...form, sucursal_id: v })}
            options={sucursales.map((s) => ({
              label: `${s.codigo_comercio || s.nombre}`,
              value: s.id,
            }))}
            testID="orden-sucursal"
          />
        )}
        <Select
          label="Técnico (opcional)"
          value={form.tecnico_id}
          onChange={(v) => setForm({ ...form, tecnico_id: v })}
          options={[
            { label: "Sin asignar", value: "" },
            ...tecnicos.map((t) => ({
              label: `${t.nombre} ${t.apellidos}`,
              value: t.id,
            })),
          ]}
          testID="orden-tecnico"
        />
        <Select
          label="Prioridad"
          value={form.prioridad}
          onChange={(v) => setForm({ ...form, prioridad: v })}
          options={[
            { label: "Baja", value: "baja" },
            { label: "Media", value: "media" },
            { label: "Alta", value: "alta" },
          ]}
          testID="orden-prioridad"
        />
        <Field
          label="Título *"
          value={form.titulo}
          onChangeText={(v) => setForm({ ...form, titulo: v })}
          placeholder="Ej: Mantención impresora"
          testID="orden-titulo"
        />
        <Field
          label="Descripción *"
          value={form.descripcion}
          onChangeText={(v) => setForm({ ...form, descripcion: v })}
          placeholder="Detalla el problema reportado..."
          multiline
          testID="orden-descripcion"
        />
        <Field
          label="Serie equipo"
          value={form.serie}
          onChangeText={(v) => setForm({ ...form, serie: v })}
          placeholder="S2PCD..."
          autoCapitalize="characters"
          testID="orden-serie"
        />
        <Field
          label="Modelo"
          value={form.modelo}
          onChangeText={(v) => setForm({ ...form, modelo: v })}
          placeholder="326017895"
          testID="orden-modelo"
        />
        <Field
          label="DDLL"
          value={form.ddll}
          onChangeText={(v) => setForm({ ...form, ddll: v })}
          placeholder="DDLL"
          testID="orden-ddll"
        />
        <Field
          label="Fecha límite (YYYY-MM-DD)"
          value={form.fecha_limite}
          onChangeText={(v) => setForm({ ...form, fecha_limite: v })}
          placeholder="2026-07-31"
          autoCapitalize="none"
          testID="orden-fecha"
        />
        <Btn
          title="Crear orden"
          onPress={onSaveCreate}
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
  headerCtaDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  headerCtaText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  searchInput: { flex: 1, color: colors.textMain, fontSize: fontSize.sm },
  sortScroll: { maxHeight: 44, flexGrow: 0, marginTop: spacing.sm },
  sortRow: {
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    gap: spacing.sm,
  },
  sortLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700" },
  sortChip: {
    paddingHorizontal: spacing.md,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sortChipText: { color: colors.textMuted, fontSize: fontSize.xs },
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
  row: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  meta: { color: colors.textMuted, fontSize: fontSize.xs, flexShrink: 1 },
  cardFoot: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  emptyTxt: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center" },

  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  actionSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  filePicker: {
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.md,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  fileText: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  fileSub: { color: colors.textMuted, fontSize: fontSize.xs },
  help: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 18 },

  // Desktop toolbar (unified filter + search + sort)
  toolbarDesktop: {
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 14,
    backgroundColor: colors.background,
  },
  filterPillsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  toolbarBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    flexWrap: "wrap",
  },
  searchBoxDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
    flex: 1,
    minWidth: 280,
  },
  sortInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },

  // Desktop table
  tableSummary: { marginBottom: spacing.md },
  tableSummaryText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
  tableCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  tableHeadRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
    alignItems: "center",
  },
  thText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tdNumero: { color: colors.accent, fontWeight: "700", fontSize: fontSize.sm },
  tdTitle: { color: colors.textMain, fontWeight: "600", fontSize: fontSize.sm },
  tdMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  tdCC: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.sm },
  tdTec: { color: colors.textMain, fontSize: fontSize.sm },
  tableEmpty: { alignItems: "center", padding: spacing.xxl, gap: spacing.sm },
  emptyTxt: { color: colors.textMuted, fontSize: fontSize.md },
});
