import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { showToast } from "@/src/components/Toast";
import { FormSheet } from "@/src/components/FormSheet";
import { Field, Btn } from "@/src/components/Form";
import { useResponsive } from "@/src/hooks/useResponsive";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";

type Tab = "solicitudes" | "config" | "catalogo" | "bodegas" | "inventario";

export default function SuministrosScreen() {
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<Tab>("solicitudes");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [bodegas, setBodegas] = useState<any[]>([]);
  const [tecnicos, setTecnicos] = useState<any[]>([]);
  const [inventario, setInventario] = useState<any[]>([]);
  const [config, setConfig] = useState<any>({
    emails_destino: [],
    telefonos_destino: [],
    from_email: "onboarding@resend.dev",
  });

  // ---- Forms ----
  const [prodOpen, setProdOpen] = useState(false);
  const [editProd, setEditProd] = useState<any | null>(null);
  const [pSku, setPSku] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pCat, setPCat] = useState("");

  const [bodOpen, setBodOpen] = useState(false);
  const [editBod, setEditBod] = useState<any | null>(null);
  const [bNombre, setBNombre] = useState("");
  const [bRegion, setBRegion] = useState("");

  const [stockOpen, setStockOpen] = useState(false);
  const [sTec, setSTec] = useState("");
  const [sSku, setSSku] = useState("");
  const [sQty, setSQty] = useState("0");

  // Config edit
  const [cEmail1, setCEmail1] = useState("");
  const [cEmail2, setCEmail2] = useState("");
  const [cEmail3, setCEmail3] = useState("");
  const [cPhone1, setCPhone1] = useState("");
  const [cPhone2, setCPhone2] = useState("");
  const [cPhone3, setCPhone3] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, p, b, t, c, i] = await Promise.all([
        api.get("/admin/suministros/solicitudes"),
        api.get("/admin/productos"),
        api.get("/admin/bodegas"),
        api.get("/admin/tecnicos"),
        api.get("/admin/suministros/config"),
        api.get("/admin/inventario"),
      ]);
      setSolicitudes(s.data);
      setProductos(p.data);
      setBodegas(b.data);
      setTecnicos(t.data);
      setConfig(c.data);
      setInventario(i.data);
      // Sync config form
      setCEmail1(c.data.emails_destino?.[0] || "");
      setCEmail2(c.data.emails_destino?.[1] || "");
      setCEmail3(c.data.emails_destino?.[2] || "");
      setCPhone1(c.data.telefonos_destino?.[0] || "");
      setCPhone2(c.data.telefonos_destino?.[1] || "");
      setCPhone3(c.data.telefonos_destino?.[2] || "");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error cargando datos", "error");
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

  const pendientes = useMemo(
    () => solicitudes.filter((s) => s.estado === "pendiente").length,
    [solicitudes]
  );

  // Producto save
  const saveProd = async () => {
    if (!pSku.trim() || !pDesc.trim()) {
      showToast("SKU y descripción son obligatorios", "error");
      return;
    }
    try {
      if (editProd) {
        await api.patch(`/admin/productos/${editProd.id}`, {
          descripcion: pDesc.trim(),
          categoria: pCat.trim() || null,
        });
        showToast("Producto actualizado", "success");
      } else {
        await api.post("/admin/productos", {
          sku: pSku.trim(),
          descripcion: pDesc.trim(),
          categoria: pCat.trim() || null,
        });
        showToast("Producto creado", "success");
      }
      setProdOpen(false);
      setEditProd(null);
      setPSku("");
      setPDesc("");
      setPCat("");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const delProd = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar este producto?")) return;
    try {
      await api.delete(`/admin/productos/${id}`);
      showToast("Producto eliminado", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  // Bodega save
  const saveBod = async () => {
    if (!bNombre.trim()) {
      showToast("Nombre obligatorio", "error");
      return;
    }
    try {
      if (editBod) {
        await api.patch(`/admin/bodegas/${editBod.id}`, {
          nombre: bNombre.trim(),
          region: bRegion.trim() || null,
        });
        showToast("Bodega actualizada", "success");
      } else {
        await api.post("/admin/bodegas", {
          nombre: bNombre.trim(),
          region: bRegion.trim() || null,
        });
        showToast("Bodega creada", "success");
      }
      setBodOpen(false);
      setEditBod(null);
      setBNombre("");
      setBRegion("");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const delBod = async (id: string) => {
    if (typeof window !== "undefined" && !window.confirm("¿Eliminar esta bodega?")) return;
    try {
      await api.delete(`/admin/bodegas/${id}`);
      showToast("Bodega eliminada", "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  // Stock save
  const saveStock = async () => {
    if (!sTec || !sSku.trim()) {
      showToast("Selecciona técnico y SKU", "error");
      return;
    }
    try {
      await api.post("/admin/inventario", {
        tecnico_id: sTec,
        sku: sSku.trim(),
        cantidad: parseInt(sQty || "0", 10),
      });
      showToast("Stock actualizado", "success");
      setStockOpen(false);
      setSTec("");
      setSSku("");
      setSQty("0");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  // Config save
  const saveConfig = async () => {
    try {
      const emails = [cEmail1, cEmail2, cEmail3].filter((e) => e.trim());
      const phones = [cPhone1, cPhone2, cPhone3].filter((e) => e.trim());
      const r = await api.patch("/admin/suministros/config", {
        emails_destino: emails,
        telefonos_destino: phones,
      });
      setConfig(r.data);
      showToast("Configuración guardada", "success");
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  // Update solicitud estado
  const setEstado = async (id: string, estado: string) => {
    try {
      await api.patch(`/admin/suministros/solicitudes/${id}?estado=${estado}`);
      showToast(`Solicitud marcada como ${estado}`, "success");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const reenviarSolicitud = async (id: string) => {
    try {
      const r = await api.post(`/admin/suministros/solicitudes/${id}/reenviar`);
      const em = r.data?.email_result?.mode;
      const wa = r.data?.whatsapp_results || [];
      const waOk = wa.filter((w: any) => w.mode === "sent").length;
      showToast(
        `Reenviado · Email: ${em || "—"} · WA: ${waOk}/${wa.length}`,
        "success"
      );
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    }
  };

  const TABS: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "solicitudes", label: "Solicitudes", icon: "list-outline", badge: pendientes },
    { id: "inventario", label: "Stock por técnico", icon: "cube-outline" },
    { id: "catalogo", label: "Catálogo", icon: "pricetag-outline" },
    { id: "bodegas", label: "Bodegas", icon: "storefront-outline" },
    { id: "config", label: "Configuración", icon: "settings-outline" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Suministros" subtitle="Solicitudes, catálogo, bodegas y stock" />

      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={[styles.tabsRow, isDesktop && { paddingHorizontal: 32 }]}
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <TouchableOpacity
              key={t.id}
              testID={`tab-${t.id}`}
              onPress={() => setTab(t.id)}
              style={[styles.tab, active && styles.tabActive]}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
              {!!t.badge && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{t.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            isDesktop && { padding: 32, paddingTop: 16 },
          ]}
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
          {/* ============ SOLICITUDES ============ */}
          {tab === "solicitudes" && (
            <View style={{ gap: spacing.md }}>
              {solicitudes.length === 0 ? (
                <EmptyState icon="list-outline" text="Aún no hay solicitudes" />
              ) : (
                solicitudes.map((s) => (
                  <View key={s.id} style={styles.card} testID={`solicitud-${s.id}`}>
                    <View style={styles.solHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.solTec}>
                          {s.tecnico
                            ? `${s.tecnico.nombre} ${s.tecnico.apellidos}`
                            : "Técnico —"}
                        </Text>
                        <Text style={styles.solMeta}>
                          {s.bodega?.nombre || "Sin bodega"} ·{" "}
                          {formatDate(s.fecha)}
                        </Text>
                      </View>
                      <SolicitudBadge estado={s.estado} urgencia={s.urgencia} />
                    </View>

                    <View style={styles.itemsList}>
                      {s.items.map((it: any, i: number) => (
                        <View key={i} style={styles.itemRow}>
                          <Text style={styles.itemSku}>{it.sku}</Text>
                          <Text style={styles.itemDesc} numberOfLines={1}>
                            {it.descripcion}
                          </Text>
                          <Text style={styles.itemQty}>x{it.cantidad}</Text>
                        </View>
                      ))}
                    </View>

                    {s.notas && (
                      <View style={styles.notesBox}>
                        <Ionicons
                          name="document-text-outline"
                          size={14}
                          color={colors.textMuted}
                        />
                        <Text style={styles.notesText}>{s.notas}</Text>
                      </View>
                    )}

                    <View style={styles.solFooter}>
                      {s.estado === "pendiente" && (
                        <>
                          <TouchableOpacity
                            testID={`atender-${s.id}`}
                            style={[styles.actBtn, { backgroundColor: colors.completed }]}
                            onPress={() => setEstado(s.id, "atendida")}
                          >
                            <Ionicons name="checkmark" size={14} color="#fff" />
                            <Text style={styles.actBtnText}>Marcar atendida</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`rechazar-${s.id}`}
                            style={[styles.actBtn, { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border }]}
                            onPress={() => setEstado(s.id, "rechazada")}
                          >
                            <Text style={[styles.actBtnText, { color: colors.danger }]}>
                              Rechazar
                            </Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity
                        testID={`reenviar-sol-${s.id}`}
                        style={[styles.actBtn, { backgroundColor: "#25D366" }]}
                        onPress={() => reenviarSolicitud(s.id)}
                      >
                        <Ionicons name="paper-plane-outline" size={14} color="#fff" />
                        <Text style={styles.actBtnText}>Reenviar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ============ INVENTARIO ============ */}
          {tab === "inventario" && (
            <View style={{ gap: spacing.md }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>Stock por técnico</Text>
                <TouchableOpacity
                  testID="add-stock-btn"
                  onPress={() => setStockOpen(true)}
                  style={styles.addCta}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addCtaText}>Asignar stock</Text>
                </TouchableOpacity>
              </View>

              {inventario.length === 0 ? (
                <EmptyState icon="cube-outline" text="No hay stock asignado" />
              ) : (
                <View style={styles.card}>
                  <View style={styles.invHeadRow}>
                    <Text style={[styles.invTh, { flex: 1.5 }]}>Técnico</Text>
                    <Text style={[styles.invTh, { width: 100 }]}>SKU</Text>
                    <Text style={[styles.invTh, { flex: 2 }]}>Producto</Text>
                    <Text style={[styles.invTh, { width: 80, textAlign: "right" }]}>Stock</Text>
                  </View>
                  {inventario.map((it, idx) => (
                    <View
                      key={it.id}
                      style={[
                        styles.invRow,
                        idx === inventario.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={[styles.invCell, { flex: 1.5 }]} numberOfLines={1}>
                        {it.tecnico?.nombre} {it.tecnico?.apellidos}
                      </Text>
                      <Text style={[styles.invSku, { width: 100 }]}>{it.sku}</Text>
                      <Text style={[styles.invCell, { flex: 2 }]} numberOfLines={1}>
                        {it.descripcion || it.producto?.descripcion || "—"}
                      </Text>
                      <Text
                        style={[
                          styles.invQty,
                          { width: 80, textAlign: "right" },
                          it.cantidad <= 0 && { color: colors.danger },
                          it.cantidad > 0 && it.cantidad < 3 && { color: colors.pending },
                        ]}
                      >
                        {it.cantidad}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ============ CATÁLOGO ============ */}
          {tab === "catalogo" && (
            <View style={{ gap: spacing.md }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{productos.length} productos</Text>
                <TouchableOpacity
                  testID="add-prod-btn"
                  onPress={() => {
                    setEditProd(null);
                    setPSku("");
                    setPDesc("");
                    setPCat("");
                    setProdOpen(true);
                  }}
                  style={styles.addCta}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addCtaText}>Nuevo producto</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.card}>
                <View style={styles.invHeadRow}>
                  <Text style={[styles.invTh, { width: 100 }]}>SKU</Text>
                  <Text style={[styles.invTh, { flex: 1 }]}>Descripción</Text>
                  <Text style={[styles.invTh, { width: 120 }]}>Categoría</Text>
                  <Text style={[styles.invTh, { width: 90, textAlign: "right" }]}>Acción</Text>
                </View>
                {productos.map((p, idx) => (
                  <View
                    key={p.id}
                    style={[styles.invRow, idx === productos.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <Text style={[styles.invSku, { width: 100 }]}>{p.sku}</Text>
                    <Text style={[styles.invCell, { flex: 1 }]} numberOfLines={1}>
                      {p.descripcion}
                    </Text>
                    <Text style={[styles.invCell, { width: 120, color: colors.textMuted }]}>
                      {p.categoria || "—"}
                    </Text>
                    <View style={{ width: 90, flexDirection: "row", gap: 6, justifyContent: "flex-end" }}>
                      <TouchableOpacity
                        testID={`edit-prod-${p.id}`}
                        onPress={() => {
                          setEditProd(p);
                          setPSku(p.sku);
                          setPDesc(p.descripcion);
                          setPCat(p.categoria || "");
                          setProdOpen(true);
                        }}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="create-outline" size={16} color={colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`del-prod-${p.id}`}
                        onPress={() => delProd(p.id)}
                        style={styles.iconBtn}
                      >
                        <Ionicons name="trash-outline" size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ============ BODEGAS ============ */}
          {tab === "bodegas" && (
            <View style={{ gap: spacing.md }}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{bodegas.length} bodegas</Text>
                <TouchableOpacity
                  testID="add-bod-btn"
                  onPress={() => {
                    setEditBod(null);
                    setBNombre("");
                    setBRegion("");
                    setBodOpen(true);
                  }}
                  style={styles.addCta}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.addCtaText}>Nueva bodega</Text>
                </TouchableOpacity>
              </View>
              {bodegas.length === 0 ? (
                <EmptyState icon="storefront-outline" text="No hay bodegas" />
              ) : (
                <View style={[styles.gridCards, isDesktop && { gap: 16 }]}>
                  {bodegas.map((b) => {
                    const tecsHere = tecnicos.filter((t) => t.bodega_id === b.id);
                    return (
                      <View key={b.id} style={[styles.bodCard, isDesktop && { flexBasis: "32%" }]}>
                        <View style={styles.bodHead}>
                          <Ionicons name="storefront" size={20} color={colors.accent} />
                          <Text style={styles.bodName}>{b.nombre}</Text>
                        </View>
                        <Text style={styles.bodMeta}>{b.region || "—"}</Text>
                        <Text style={styles.bodTecs}>{tecsHere.length} técnico(s)</Text>
                        <View style={styles.bodActions}>
                          <TouchableOpacity
                            testID={`edit-bod-${b.id}`}
                            onPress={() => {
                              setEditBod(b);
                              setBNombre(b.nombre);
                              setBRegion(b.region || "");
                              setBodOpen(true);
                            }}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="create-outline" size={16} color={colors.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`del-bod-${b.id}`}
                            onPress={() => delBod(b.id)}
                            style={styles.iconBtn}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {/* ============ CONFIG ============ */}
          {tab === "config" && (
            <View style={{ gap: spacing.lg }}>
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Emails destino</Text>
                <Text style={styles.cardSub}>
                  Hasta 3 direcciones que recibirán los correos de solicitud.
                  Asunto: "Solicitud de suministros empresa MVG"
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {[
                    { v: cEmail1, set: setCEmail1, ph: "compras@mvg.cl" },
                    { v: cEmail2, set: setCEmail2, ph: "gerencia@mvg.cl" },
                    { v: cEmail3, set: setCEmail3, ph: "admin@mvg.cl" },
                  ].map((f, i) => (
                    <View key={i} style={styles.inputBox}>
                      <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                      <TextInput
                        testID={`cfg-email-${i + 1}`}
                        value={f.v}
                        onChangeText={f.set}
                        placeholder={f.ph}
                        placeholderTextColor={colors.textDim}
                        style={styles.input}
                        autoCapitalize="none"
                        keyboardType="email-address"
                      />
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Teléfonos WhatsApp destino</Text>
                <Text style={styles.cardSub}>
                  Hasta 3 números (con código país, sin "+"). Ej: 56912345678
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {[
                    { v: cPhone1, set: setCPhone1, ph: "56912345678" },
                    { v: cPhone2, set: setCPhone2, ph: "56987654321" },
                    { v: cPhone3, set: setCPhone3, ph: "34600000000" },
                  ].map((f, i) => (
                    <View key={i} style={styles.inputBox}>
                      <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                      <TextInput
                        testID={`cfg-phone-${i + 1}`}
                        value={f.v}
                        onChangeText={f.set}
                        placeholder={f.ph}
                        placeholderTextColor={colors.textDim}
                        style={styles.input}
                        keyboardType="phone-pad"
                      />
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                testID="save-config-btn"
                onPress={saveConfig}
                style={styles.saveBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Guardar configuración</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* ===== Form: producto ===== */}
      <FormSheet
        visible={prodOpen}
        onClose={() => setProdOpen(false)}
        title={editProd ? "Editar producto" : "Nuevo producto"}
        testID="prod-sheet"
      >
        <Field label="SKU *" value={pSku} onChangeText={setPSku} placeholder="500646" />
        <Field
          label="Descripción *"
          value={pDesc}
          onChangeText={setPDesc}
          placeholder="Cable Serial VX 805 6 mts."
        />
        <Field
          label="Categoría"
          value={pCat}
          onChangeText={setPCat}
          placeholder="Cable / Pin Pad / Insumo"
        />
        <Btn title="Guardar" onPress={saveProd} variant="primary" testID="save-prod" />
      </FormSheet>

      {/* ===== Form: bodega ===== */}
      <FormSheet
        visible={bodOpen}
        onClose={() => setBodOpen(false)}
        title={editBod ? "Editar bodega" : "Nueva bodega"}
        testID="bod-sheet"
      >
        <Field label="Nombre *" value={bNombre} onChangeText={setBNombre} placeholder="Santiago" />
        <Field label="Región" value={bRegion} onChangeText={setBRegion} placeholder="Región Metropolitana" />
        <Btn title="Guardar" onPress={saveBod} variant="primary" testID="save-bod" />
      </FormSheet>

      {/* ===== Form: stock ===== */}
      <FormSheet
        visible={stockOpen}
        onClose={() => setStockOpen(false)}
        title="Asignar stock a técnico"
        testID="stock-sheet"
      >
        <Text style={styles.fieldLabel}>Técnico *</Text>
        <View style={styles.pickerBox}>
          {tecnicos.length === 0 ? (
            <Text style={styles.help}>No hay técnicos registrados.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 200 }}>
              {tecnicos.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  testID={`pick-tec-${t.id}`}
                  onPress={() => setSTec(t.id)}
                  style={[styles.pickRow, sTec === t.id && styles.pickRowActive]}
                >
                  <Text style={[styles.pickText, sTec === t.id && { color: colors.primary, fontWeight: "700" }]}>
                    {t.nombre} {t.apellidos}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
        <Text style={styles.fieldLabel}>Producto (SKU) *</Text>
        <View style={styles.pickerBox}>
          <ScrollView style={{ maxHeight: 200 }}>
            {productos.map((p) => (
              <TouchableOpacity
                key={p.id}
                testID={`pick-prod-${p.sku}`}
                onPress={() => setSSku(p.sku)}
                style={[styles.pickRow, sSku === p.sku && styles.pickRowActive]}
              >
                <Text style={styles.pickSku}>{p.sku}</Text>
                <Text style={[styles.pickText, { flex: 1 }]} numberOfLines={1}>
                  {p.descripcion}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <Field
          label="Cantidad *"
          value={sQty}
          onChangeText={setSQty}
          placeholder="2"
          keyboardType="numeric"
        />
        <Btn title="Guardar stock" onPress={saveStock} variant="primary" testID="save-stock" />
      </FormSheet>
    </SafeAreaView>
  );
}

const formatDate = (iso?: string) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const SolicitudBadge: React.FC<{ estado: string; urgencia: string }> = ({
  estado,
  urgencia,
}) => {
  const estadoColor =
    estado === "pendiente"
      ? colors.pending
      : estado === "atendida"
      ? colors.completed
      : colors.danger;
  return (
    <View style={{ gap: 4, alignItems: "flex-end" }}>
      <View style={[styles.badge, { backgroundColor: `${estadoColor}1a`, borderColor: estadoColor }]}>
        <Text style={[styles.badgeText, { color: estadoColor }]}>{estado.toUpperCase()}</Text>
      </View>
      {urgencia !== "normal" && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor:
                urgencia === "alta" ? `${colors.danger}1a` : `${colors.warning}1a`,
              borderColor: urgencia === "alta" ? colors.danger : colors.warning,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              { color: urgencia === "alta" ? colors.danger : colors.warning },
            ]}
          >
            ⚡ {urgencia}
          </Text>
        </View>
      )}
    </View>
  );
};

const EmptyState: React.FC<{ icon: any; text: string }> = ({ icon, text }) => (
  <View style={styles.empty}>
    <Ionicons name={icon} size={42} color={colors.textDim} />
    <Text style={styles.emptyText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabsScroll: { flexGrow: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabsRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.xs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "600" },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },
  tabBadge: {
    backgroundColor: colors.pending,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: "center",
  },
  tabBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },

  content: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  sectionTitle: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "700" },
  addCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addCtaText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  cardSub: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },

  // Solicitud item
  solHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  solTec: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  solMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  itemsList: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  itemSku: {
    color: colors.accent,
    fontWeight: "700",
    fontSize: fontSize.xs,
    width: 70,
    fontFamily: "monospace" as any,
  },
  itemDesc: { color: colors.textMain, fontSize: fontSize.xs, flex: 1 },
  itemQty: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
  notesBox: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: "flex-start",
  },
  notesText: { color: colors.textMuted, fontSize: fontSize.xs, flex: 1 },
  solFooter: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  actBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  actBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.xs },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },

  // Inventory table
  invHeadRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  invTh: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  invRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    marginHorizontal: -spacing.lg,
  },
  invCell: { color: colors.textMain, fontSize: fontSize.sm },
  invSku: { color: colors.accent, fontWeight: "700", fontSize: fontSize.xs, fontFamily: "monospace" as any },
  invQty: { color: colors.completed, fontWeight: "800", fontSize: fontSize.md },

  // Bodegas grid
  gridCards: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  bodCard: {
    flexBasis: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
    ...shadow.sm,
  },
  bodHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  bodName: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  bodMeta: { color: colors.textMuted, fontSize: fontSize.sm },
  bodTecs: { color: colors.primary, fontSize: fontSize.xs, fontWeight: "700", marginTop: 4 },
  bodActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Config
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: { flex: 1, color: colors.textMain, fontSize: fontSize.sm, outlineStyle: "none" as any },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },

  // Picker
  fieldLabel: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.xs, letterSpacing: 0.4 },
  pickerBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    overflow: "hidden",
  },
  pickRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    alignItems: "center",
  },
  pickRowActive: { backgroundColor: colors.primarySoft },
  pickText: { color: colors.textMain, fontSize: fontSize.sm },
  pickSku: { color: colors.accent, fontWeight: "700", fontSize: fontSize.xs, fontFamily: "monospace" as any, width: 70 },

  empty: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  emptyText: { color: colors.textMuted, fontSize: fontSize.sm },
  help: { color: colors.textMuted, fontSize: fontSize.xs, padding: spacing.md },
});
