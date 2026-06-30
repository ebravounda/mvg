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

function FilterSelect({
  value,
  onChange,
  options,
  testID,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  testID?: string;
}) {
  if (Platform.OS === "web") {
    return (
      <select
        // @ts-expect-error rn-web acepta esto
        value={value}
        onChange={(e: any) => onChange(e.target.value)}
        data-testid={testID}
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          padding: "8px 10px",
          fontSize: 13,
          color: colors.textMain,
          backgroundColor: "#fff",
          outline: "none",
          minWidth: 140,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  // Mobile: tap cycles entre opciones
  return (
    <TouchableOpacity
      onPress={() => {
        const idx = options.findIndex((o) => o.value === value);
        const next = options[(idx + 1) % options.length];
        onChange(next.value);
      }}
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 8,
      }}
      testID={testID}
    >
      <Text style={{ color: colors.textMain, fontSize: 13 }}>
        {options.find((o) => o.value === value)?.label || "—"}
      </Text>
    </TouchableOpacity>
  );
}

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

  // Selection mode states (functions defined after `filteredItems` below)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickerTecOpen, setPickerTecOpen] = useState(false);
  const [bulkTec, setBulkTec] = useState<string>("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [autoMasivoLoading, setAutoMasivoLoading] = useState(false);

  // Filtros server-side (paginación)
  const [filterCliente, setFilterCliente] = useState<string>("");
  const [filterComuna, setFilterComuna] = useState<string>("");
  const [filterRegion, setFilterRegion] = useState<string>("");
  const [page, setPage] = useState(1);
  const [pageLimit] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filtroOptions, setFiltroOptions] = useState<{
    comunas: string[];
    regiones: string[];
    clientes: { id: string; nombre: string; nombre_fantasia?: string; rut?: string }[];
  }>({ comunas: [], regiones: [], clientes: [] });
  const [showFilters, setShowFilters] = useState(false);

  // ---------- Acordeón por Región → Comuna (declarado antes de `load` para evitar TDZ) ----------
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"region_comuna" | "none">("region_comuna");
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  // Cargar opciones de filtros (se hace una sola vez)
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/admin/ordenes/filtros");
        setFiltroOptions(r.data);
      } catch (e) {
        console.log("filtros opts err", e);
      }
    })();
  }, []);

  const load = useCallback(
    async (overridePage?: number) => {
      try {
        const useGroupMode = groupBy === "region_comuna";
        const params = new URLSearchParams();
        if (useGroupMode) {
          // Acordeón: traer TODAS las órdenes (compact = sin pin_pads/fotos)
          params.append("compact", "true");
          params.append("limit", "10000");
          params.append("paginated", "false");
        } else {
          params.append("paginated", "true");
          params.append("compact", "true");
          params.append("limit", String(pageLimit));
          params.append("page", String(overridePage ?? page));
        }
        if (filter && filter !== "sin_asignar") params.append("estado", filter);
        if (filterCliente) params.append("cliente_id", filterCliente);
        if (filterComuna) params.append("comuna", filterComuna);
        if (filterRegion) params.append("region", filterRegion);
        if (query.trim()) params.append("search", query.trim());

        const r = await api.get(`/admin/ordenes?${params.toString()}`);
        let data: any[] = useGroupMode ? (r.data || []) : (r.data?.items || []);
        if (filter === "sin_asignar") {
          // este filtro sigue siendo client-side (no hay query mongo simple)
          data = data.filter((o: any) => !o.tecnico_id);
        }
        setItems(data);
        if (useGroupMode) {
          setTotalCount(data.length);
          setTotalPages(1);
        } else {
          setTotalCount(r.data?.total || 0);
          setTotalPages(r.data?.total_pages || 1);
        }
      } catch (e) {
        console.log("ordenes load err", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, filterCliente, filterComuna, filterRegion, query, page, pageLimit, groupBy]
  );

  // Recarga al cambiar filtros (volver a página 1)
  useEffect(() => {
    setPage(1);
  }, [filter, filterCliente, filterComuna, filterRegion, query, groupBy]);

  // Debounce de búsqueda (300ms) — solo aplica para query
  useEffect(() => {
    const t = setTimeout(() => {
      load(1);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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

  // ---------- Acordeón por Región → Comuna ----------
  const groupedData = useMemo(() => {
    if (groupBy === "none") {
      return {
        groups: [] as Array<{ key: string; region: string; comuna: string; orders: any[] }>,
        flat: filteredItems.map((o) => ({ kind: "row" as const, order: o, groupKey: "" })),
      };
    }
    // Agrupar por (region, comuna). Mantener orden definido por sortBy dentro
    // de cada grupo. Las claves se ordenan por (región alfabético, comuna alfabético).
    const map = new Map<string, { region: string; comuna: string; orders: any[] }>();
    for (const o of filteredItems) {
      const region = (o.sucursal?.region || "Sin región").trim();
      const comuna = (o.sucursal?.comuna || "Sin comuna").trim();
      const key = `${region}::${comuna}`;
      if (!map.has(key)) {
        map.set(key, { region, comuna, orders: [] });
      }
      map.get(key)!.orders.push(o);
    }
    const groups = Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => {
        const r = a.region.localeCompare(b.region, "es", { sensitivity: "base" });
        if (r !== 0) return r;
        return a.comuna.localeCompare(b.comuna, "es", { sensitivity: "base" });
      });
    // Build flat list for both desktop and mobile rendering:
    const flat: Array<
      | { kind: "header"; key: string; region: string; comuna: string; count: number; collapsed: boolean }
      | { kind: "row"; order: any; groupKey: string }
    > = [];
    for (const g of groups) {
      const collapsed = collapsedGroups.has(g.key);
      flat.push({
        kind: "header",
        key: g.key,
        region: g.region,
        comuna: g.comuna,
        count: g.orders.length,
        collapsed,
      });
      if (!collapsed) {
        for (const o of g.orders) {
          flat.push({ kind: "row", order: o, groupKey: g.key });
        }
      }
    }
    return { groups, flat };
  }, [filteredItems, groupBy, collapsedGroups]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedGroups(new Set(groupedData.groups.map((g) => g.key)));
  }, [groupedData.groups]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // Auto-colapsar todos los grupos al cargar por primera vez (si hay >5 comunas).
  // Esto evita renderizar miles de filas a la vez y hace la UI fluida.
  useEffect(() => {
    if (autoCollapsed) return;
    if (groupBy !== "region_comuna") return;
    if (groupedData.groups.length > 5) {
      setCollapsedGroups(new Set(groupedData.groups.map((g) => g.key)));
      setAutoCollapsed(true);
    } else if (groupedData.groups.length > 0) {
      setAutoCollapsed(true);
    }
  }, [groupedData.groups, groupBy, autoCollapsed]);

  // Reset auto-collapse cuando cambian los filtros principales (para recolapsar
  // sobre el nuevo conjunto resultante)
  useEffect(() => {
    setAutoCollapsed(false);
  }, [filter, filterCliente, filterComuna, filterRegion, groupBy]);

  const selectAllInGroup = useCallback(
    (key: string) => {
      const g = groupedData.groups.find((x) => x.key === key);
      if (!g) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const o of g.orders) next.add(o.id);
        return next;
      });
    },
    [groupedData.groups]
  );

  // ---------- Selection mode handlers ----------
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const enterSelectionMode = useCallback(async () => {
    setSelectionMode(true);
    setSelectedIds(new Set());
    setBulkTec("");
    if (tecnicos.length === 0) {
      try {
        const t = await api.get("/admin/tecnicos");
        setTecnicos(t.data);
      } catch (e) {
        console.log("load tecnicos err", e);
      }
    }
  }, [tecnicos.length]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkTec("");
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((o) => next.add(o.id));
      return next;
    });
  }, [filteredItems]);

  const handleBulkAssign = useCallback(async () => {
    if (selectedIds.size === 0) {
      showToast("Selecciona al menos una orden", "error");
      return;
    }
    if (!bulkTec) {
      showToast("Selecciona un técnico", "error");
      return;
    }
    setBulkAssigning(true);
    try {
      const r = await api.post("/admin/ordenes/asignar-bulk", {
        orden_ids: Array.from(selectedIds),
        tecnico_id: bulkTec,
      });
      showToast(
        `${r.data.asignadas} órdenes asignadas a ${r.data.tecnico}`,
        "success"
      );
      setPickerTecOpen(false);
      exitSelectionMode();
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error al asignar", "error");
    } finally {
      setBulkAssigning(false);
    }
  }, [selectedIds, bulkTec, exitSelectionMode, load]);

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
        title={selectionMode ? `${selectedIds.size} seleccionada${selectedIds.size === 1 ? "" : "s"}` : "Órdenes"}
        subtitle={selectionMode ? "Toca órdenes para seleccionar" : "Gestiona y asigna órdenes de servicio"}
        rightSlot={
          selectionMode ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              {isDesktop && (
                <TouchableOpacity
                  testID="seleccionar-todo-btn"
                  onPress={selectAllVisible}
                  style={styles.headerSecondary}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkbox-outline" size={16} color={colors.primary} />
                  <Text style={styles.headerSecondaryText}>Todas</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                testID="cancelar-seleccion-btn"
                onPress={exitSelectionMode}
                style={isDesktop ? styles.headerSecondary : styles.headerCta}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={isDesktop ? 16 : 20} color={isDesktop ? colors.textMain : "#fff"} />
                {isDesktop && <Text style={styles.headerSecondaryText}>Cancelar</Text>}
              </TouchableOpacity>
            </View>
          ) : isDesktop ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <TouchableOpacity
                testID="iniciar-seleccion-btn"
                onPress={enterSelectionMode}
                style={styles.headerSecondary}
                activeOpacity={0.85}
              >
                <Ionicons name="checkbox-outline" size={16} color={colors.primary} />
                <Text style={styles.headerSecondaryText}>Seleccionar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="abrir-acciones-btn"
                onPress={() => setActionsOpen(true)}
                style={styles.headerCtaDesktop}
                activeOpacity={0.85}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.headerCtaText}>Nueva orden</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                testID="iniciar-seleccion-btn"
                onPress={enterSelectionMode}
                style={[styles.headerCta, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              >
                <Ionicons name="checkbox-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="abrir-acciones-btn"
                onPress={() => setActionsOpen(true)}
                style={styles.headerCta}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
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
                placeholder="Buscar por número de orden o título…"
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
            <TouchableOpacity
              testID="toggle-filtros-btn"
              style={[styles.headerSecondary, (filterCliente || filterComuna || filterRegion) && {
                borderColor: colors.primary,
                backgroundColor: colors.primarySoft,
              }]}
              onPress={() => setShowFilters((v) => !v)}
            >
              <Ionicons name="funnel-outline" size={14} color={colors.primary} />
              <Text style={styles.headerSecondaryText}>
                Filtros{
                  [filterCliente, filterComuna, filterRegion].filter(Boolean).length > 0
                    ? ` (${[filterCliente, filterComuna, filterRegion].filter(Boolean).length})`
                    : ""
                }
              </Text>
            </TouchableOpacity>
          </View>

          {showFilters && (
            <View style={styles.filtersBox} testID="filtros-box">
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>Cliente</Text>
                <FilterSelect
                  value={filterCliente}
                  onChange={setFilterCliente}
                  options={[
                    { value: "", label: "Todos" },
                    ...filtroOptions.clientes.map((c) => ({
                      value: c.id,
                      label: c.nombre_fantasia || c.nombre,
                    })),
                  ]}
                  testID="filtro-cliente"
                />
              </View>
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>Comuna</Text>
                <FilterSelect
                  value={filterComuna}
                  onChange={setFilterComuna}
                  options={[
                    { value: "", label: "Todas" },
                    ...filtroOptions.comunas.map((c) => ({ value: c, label: c })),
                  ]}
                  testID="filtro-comuna"
                />
              </View>
              <View style={styles.filterCol}>
                <Text style={styles.filterLabel}>Región</Text>
                <FilterSelect
                  value={filterRegion}
                  onChange={setFilterRegion}
                  options={[
                    { value: "", label: "Todas" },
                    ...filtroOptions.regiones.map((r) => ({ value: r, label: r })),
                  ]}
                  testID="filtro-region"
                />
              </View>
              {(filterCliente || filterComuna || filterRegion) && (
                <TouchableOpacity
                  testID="limpiar-filtros-btn"
                  onPress={() => {
                    setFilterCliente("");
                    setFilterComuna("");
                    setFilterRegion("");
                  }}
                  style={styles.clearFiltersBtn}
                >
                  <Ionicons name="close-circle" size={14} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>
                    Limpiar
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
              {groupBy === "region_comuna"
                ? `${totalCount} ${totalCount === 1 ? "orden total" : "órdenes totales"}`
                : `${filteredItems.length} mostradas · ${totalCount} total`}
              {groupBy === "region_comuna" && groupedData.groups.length > 0 && (
                <Text style={{ color: colors.textMuted }}>
                  {" "}
                  · {groupedData.groups.length} comuna{groupedData.groups.length === 1 ? "" : "s"}
                </Text>
              )}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                testID="grupo-toggle-btn"
                onPress={() =>
                  setGroupBy(groupBy === "region_comuna" ? "none" : "region_comuna")
                }
                style={styles.headerSecondary}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={groupBy === "region_comuna" ? "albums" : "list"}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.headerSecondaryText}>
                  {groupBy === "region_comuna" ? "Por comuna" : "Lista"}
                </Text>
              </TouchableOpacity>
              {groupBy === "region_comuna" && (
                <>
                  <TouchableOpacity
                    testID="grupo-expandir-todo"
                    onPress={expandAll}
                    style={styles.headerSecondary}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="chevron-down" size={14} color={colors.textMain} />
                    <Text style={styles.headerSecondaryText}>Expandir</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="grupo-colapsar-todo"
                    onPress={collapseAll}
                    style={styles.headerSecondary}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="chevron-up" size={14} color={colors.textMain} />
                    <Text style={styles.headerSecondaryText}>Colapsar</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
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
              groupedData.flat.map((row, idx) => {
                if (row.kind === "header") {
                  return (
                    <TouchableOpacity
                      key={`hdr-${row.key}`}
                      testID={`grupo-header-${row.key}`}
                      style={styles.groupHeaderDesktop}
                      onPress={() => toggleGroup(row.key)}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={row.collapsed ? "chevron-forward" : "chevron-down"}
                        size={16}
                        color={colors.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.groupHeaderRegion}>{row.region}</Text>
                        <Text style={styles.groupHeaderComuna}>
                          {row.comuna} · {row.count} {row.count === 1 ? "orden" : "órdenes"}
                        </Text>
                      </View>
                      {selectionMode && (
                        <TouchableOpacity
                          testID={`grupo-select-${row.key}`}
                          onPress={(e: any) => {
                            e?.stopPropagation?.();
                            selectAllInGroup(row.key);
                          }}
                          style={styles.groupSelectAllBtn}
                        >
                          <Ionicons name="checkmark-done" size={14} color={colors.primary} />
                          <Text style={styles.groupSelectAllText}>Seleccionar todas</Text>
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  );
                }
                const o = row.order;
                return (
                <TouchableOpacity
                  key={o.id}
                  testID={`orden-card-${o.id}`}
                  style={[
                    styles.tableRow,
                    idx === groupedData.flat.length - 1 && { borderBottomWidth: 0 },
                    selectedIds.has(o.id) && { backgroundColor: colors.primarySoft },
                  ]}
                  onPress={() => {
                    if (selectionMode) {
                      toggleSelect(o.id);
                    } else {
                      router.push(`/(admin)/ordenes/${o.id}`);
                    }
                  }}
                  onLongPress={() => {
                    if (!selectionMode) {
                      enterSelectionMode();
                      toggleSelect(o.id);
                    }
                  }}
                  activeOpacity={0.6}
                >
                  {selectionMode && (
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: selectedIds.has(o.id)
                          ? colors.primary
                          : colors.border,
                        backgroundColor: selectedIds.has(o.id)
                          ? colors.primary
                          : "#fff",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 10,
                      }}
                      testID={`select-check-${o.id}`}
                    >
                      {selectedIds.has(o.id) && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </View>
                  )}
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
                );
              })
            )}
            {/* Paginación desktop (solo en modo lista plana) */}
            {groupBy !== "region_comuna" && totalPages > 1 && (
              <View style={styles.pagination} testID="pagination-desktop">
                <TouchableOpacity
                  testID="page-prev-btn"
                  style={[styles.pageBtn, page <= 1 && { opacity: 0.4 }]}
                  disabled={page <= 1}
                  onPress={() => { setPage(page - 1); load(page - 1); }}
                >
                  <Ionicons name="chevron-back" size={14} color={colors.textMain} />
                  <Text style={styles.pageBtnText}>Anterior</Text>
                </TouchableOpacity>
                <Text style={styles.pageInfo}>
                  Página {page} de {totalPages}
                </Text>
                <TouchableOpacity
                  testID="page-next-btn"
                  style={[styles.pageBtn, page >= totalPages && { opacity: 0.4 }]}
                  disabled={page >= totalPages}
                  onPress={() => { setPage(page + 1); load(page + 1); }}
                >
                  <Text style={styles.pageBtnText}>Siguiente</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.textMain} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={groupedData.flat as any[]}
          keyExtractor={(item: any) =>
            item.kind === "header" ? `hdr-${item.key}` : item.order.id
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: 120,
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
          renderItem={({ item }: any) => {
            if (item.kind === "header") {
              return (
                <TouchableOpacity
                  testID={`grupo-header-${item.key}`}
                  style={styles.groupHeaderMobile}
                  onPress={() => toggleGroup(item.key)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.collapsed ? "chevron-forward" : "chevron-down"}
                    size={18}
                    color={colors.primary}
                  />
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.groupHeaderRegion}>{item.region}</Text>
                    <Text style={styles.groupHeaderComuna}>
                      {item.comuna} · {item.count}{" "}
                      {item.count === 1 ? "orden" : "órdenes"}
                    </Text>
                  </View>
                  {selectionMode && (
                    <TouchableOpacity
                      testID={`grupo-select-${item.key}`}
                      onPress={() => selectAllInGroup(item.key)}
                      style={styles.groupSelectAllBtn}
                    >
                      <Ionicons
                        name="checkmark-done"
                        size={14}
                        color={colors.primary}
                      />
                      <Text style={styles.groupSelectAllText}>Marcar</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            }
            const o = item.order;
            return (
            <TouchableOpacity
              testID={`orden-card-${o.id}`}
              style={[
                styles.card,
                selectionMode && selectedIds.has(o.id) && {
                  borderColor: colors.primary,
                  backgroundColor: colors.primarySoft,
                },
              ]}
              onPress={() => {
                if (selectionMode) {
                  toggleSelect(o.id);
                } else {
                  router.push(`/(admin)/ordenes/${o.id}`);
                }
              }}
              onLongPress={() => {
                if (!selectionMode) {
                  enterSelectionMode();
                  toggleSelect(o.id);
                }
              }}
            >
              <View style={styles.cardHead}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                  {selectionMode && (
                    <View
                      testID={`select-check-m-${o.id}`}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: selectedIds.has(o.id) ? colors.primary : colors.border,
                        backgroundColor: selectedIds.has(o.id) ? colors.primary : "#fff",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {selectedIds.has(o.id) && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                  )}
                  <Text style={styles.numero}>{o.numero}</Text>
                </View>
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
            );
          }}
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

        <TouchableOpacity
          testID="accion-seleccionar-asignar"
          style={styles.actionItem}
          onPress={() => {
            setActionsOpen(false);
            enterSelectionMode();
          }}
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: `${colors.primary}22` },
            ]}
          >
            <Ionicons name="checkbox" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Seleccionar y asignar</Text>
            <Text style={styles.actionSub}>
              Marca varias órdenes y asígnalas a un técnico
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          testID="accion-asignar-masivo"
          style={styles.actionItem}
          onPress={async () => {
            setActionsOpen(false);
            setAutoMasivoLoading(true);
            try {
              const r = await api.post("/admin/ordenes/asignar-masivo", {
                max_por_tecnico: 25,
              });
              showToast(
                `${r.data.asignadas} órdenes asignadas a técnicos por cercanía`,
                "success"
              );
              load();
            } catch (e: any) {
              showToast(
                e?.response?.data?.detail || "Error en asignación automática",
                "error"
              );
            } finally {
              setAutoMasivoLoading(false);
            }
          }}
        >
          <View
            style={[
              styles.actionIcon,
              { backgroundColor: `${colors.completed}22` },
            ]}
          >
            <Ionicons name="people" size={24} color={colors.completed} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Asignación automática</Text>
            <Text style={styles.actionSub}>
              Distribuye órdenes pendientes según cercanía por comuna (máx 25/téc)
            </Text>
          </View>
          {autoMasivoLoading ? (
            <ActivityIndicator color={colors.completed} size="small" />
          ) : (
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          )}
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

      {/* Sheet: elegir técnico para asignación masiva */}
      <FormSheet
        visible={pickerTecOpen}
        onClose={() => !bulkAssigning && setPickerTecOpen(false)}
        title={`Asignar ${selectedIds.size} ${selectedIds.size === 1 ? "orden" : "órdenes"}`}
        testID="picker-tecnico-sheet"
      >
        <Text style={styles.help}>
          Selecciona el técnico al que se asignarán las {selectedIds.size}{" "}
          órdenes seleccionadas. Se enviará una notificación por WhatsApp al
          técnico.
        </Text>
        <Select
          label="Técnico destino *"
          value={bulkTec}
          onChange={setBulkTec}
          options={tecnicos.map((t) => ({
            label: `${t.nombre} ${t.apellidos}${t.comuna ? ` · ${t.comuna}` : ""}`,
            value: t.id,
          }))}
          testID="bulk-tecnico-select"
        />
        <Btn
          title={`Asignar ${selectedIds.size} órdenes`}
          onPress={handleBulkAssign}
          loading={bulkAssigning}
          disabled={!bulkTec || selectedIds.size === 0}
          testID="bulk-asignar-submit"
          icon={<Ionicons name="checkmark-circle" size={18} color="#fff" />}
        />
      </FormSheet>

      {/* Sticky bottom bar para selección masiva */}
      {selectionMode && (
        <View style={styles.selectionBar} testID="selection-bar">
          <View style={{ flex: 1 }}>
            <Text style={styles.selectionCount}>
              {selectedIds.size}{" "}
              {selectedIds.size === 1 ? "orden seleccionada" : "órdenes seleccionadas"}
            </Text>
            <Text style={styles.selectionHint}>
              {selectedIds.size === 0
                ? "Toca las órdenes para seleccionar"
                : "Pulsa Asignar para continuar"}
            </Text>
          </View>
          {!isDesktop && (
            <TouchableOpacity
              testID="seleccionar-todo-m-btn"
              onPress={selectAllVisible}
              style={styles.selectionAllBtn}
            >
              <Ionicons name="checkmark-done" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                Todas
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            testID="bulk-asignar-abrir-picker"
            onPress={() => {
              if (selectedIds.size === 0) {
                showToast("Selecciona al menos una orden", "error");
                return;
              }
              setBulkTec("");
              setPickerTecOpen(true);
            }}
            style={[
              styles.selectionPrimary,
              selectedIds.size === 0 && { opacity: 0.5 },
            ]}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="person-add" size={16} color="#fff" />
            <Text style={styles.selectionPrimaryText}>Asignar</Text>
          </TouchableOpacity>
        </View>
      )}
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
  tableSummary: {
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.md,
  },
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

  // Header secondary button (Seleccionar / Cancelar)
  headerSecondary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  headerSecondaryText: {
    color: colors.textMain,
    fontWeight: "700",
    fontSize: fontSize.xs,
  },

  // Selection bar (bottom sticky)
  selectionBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.lg,
  },
  selectionCount: {
    color: colors.textMain,
    fontWeight: "800",
    fontSize: fontSize.sm,
  },
  selectionHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  selectionAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  selectionPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  selectionPrimaryText: { color: "#fff", fontWeight: "800", fontSize: fontSize.sm },

  // Acordeón de grupos (region/comuna)
  groupHeaderDesktop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  groupHeaderMobile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  groupHeaderRegion: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  groupHeaderComuna: {
    fontSize: fontSize.md,
    color: colors.textMain,
    fontWeight: "800",
    marginTop: 1,
  },
  groupSelectAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  groupSelectAllText: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: "700",
  },
  filtersBox: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    marginTop: 6,
    alignItems: "flex-end",
  },
  filterCol: { minWidth: 160, gap: 4 },
  filterLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  clearFiltersBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 8,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  pageBtnText: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.xs },
  pageInfo: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.sm },
});
