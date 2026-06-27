import { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
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
import { Btn } from "@/src/components/Form";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";

type Tab = "solicitar" | "historial" | "stock";

interface CartItem {
  sku: string;
  descripcion: string;
  cantidad: number;
  comentario?: string;
}

export default function TecnicoSuministros() {
  const [tab, setTab] = useState<Tab>("solicitar");
  const [productos, setProductos] = useState<any[]>([]);
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [notas, setNotas] = useState("");
  const [urgencia, setUrgencia] = useState<"normal" | "media" | "alta">("normal");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, s, inv] = await Promise.all([
        api.get("/tecnico/productos"),
        api.get("/tecnico/suministros/solicitudes"),
        api.get("/tecnico/inventario"),
      ]);
      setProductos(p.data);
      setSolicitudes(s.data);
      setStock(inv.data);
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

  const addToCart = (p: any) => {
    setCart((c) => {
      const ex = c.find((x) => x.sku === p.sku);
      if (ex) {
        return c.map((x) =>
          x.sku === p.sku ? { ...x, cantidad: x.cantidad + 1 } : x
        );
      }
      return [...c, { sku: p.sku, descripcion: p.descripcion, cantidad: 1 }];
    });
    setPickerOpen(false);
    setPickerSearch("");
  };

  const updateCartItem = (sku: string, change: Partial<CartItem>) => {
    setCart((c) => c.map((it) => (it.sku === sku ? { ...it, ...change } : it)));
  };

  const removeFromCart = (sku: string) => {
    setCart((c) => c.filter((it) => it.sku !== sku));
  };

  const submit = async () => {
    if (cart.length === 0) {
      showToast("Agrega al menos un producto", "error");
      return;
    }
    for (const it of cart) {
      if (it.cantidad <= 0) {
        showToast("Las cantidades deben ser mayores a 0", "error");
        return;
      }
    }
    setSubmitting(true);
    try {
      const r = await api.post("/tecnico/suministros/solicitudes", {
        items: cart.map((c) => ({
          sku: c.sku,
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          comentario: c.comentario || null,
        })),
        notas: notas || null,
        urgencia,
      });
      const em = r.data?.email_result?.mode;
      const wa = r.data?.whatsapp_results || [];
      const waOk = wa.filter((w: any) => w.mode === "sent").length;
      showToast(
        `Solicitud enviada ✓ · Email: ${em || "—"} · WA: ${waOk}/${wa.length}`,
        "success"
      );
      setCart([]);
      setNotas("");
      setUrgencia("normal");
      setTab("historial");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const productosFiltrados = useMemo(() => {
    if (!pickerSearch.trim()) return productos;
    const q = pickerSearch.toLowerCase();
    return productos.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.descripcion?.toLowerCase().includes(q)
    );
  }, [productos, pickerSearch]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Suministros" />

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {[
          { id: "solicitar" as Tab, label: "Solicitar", icon: "add-circle-outline" },
          { id: "stock" as Tab, label: "Mi stock", icon: "cube-outline" },
          { id: "historial" as Tab, label: "Historial", icon: "time-outline" },
        ].map((t) => {
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
                name={t.icon as any}
                size={16}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
            />
          }
        >
          {/* ===== SOLICITAR ===== */}
          {tab === "solicitar" && (
            <View style={{ gap: spacing.md }}>
              <View style={styles.card}>
                <View style={styles.cardHead}>
                  <Text style={styles.cardTitle}>Items solicitados ({cart.length})</Text>
                  <TouchableOpacity
                    testID="add-item-btn"
                    onPress={() => setPickerOpen(true)}
                    style={styles.addBtn}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.addBtnText}>Agregar producto</Text>
                  </TouchableOpacity>
                </View>

                {cart.length === 0 ? (
                  <View style={styles.emptyCart}>
                    <Ionicons name="cube-outline" size={40} color={colors.textDim} />
                    <Text style={styles.emptyText}>
                      Aún no has agregado productos.
                    </Text>
                    <Text style={styles.emptySub}>
                      Toca "Agregar producto" para seleccionar del catálogo.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {cart.map((it) => (
                      <View key={it.sku} style={styles.cartItem} testID={`cart-item-${it.sku}`}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemSku}>SKU {it.sku}</Text>
                          <Text style={styles.itemDesc} numberOfLines={1}>
                            {it.descripcion}
                          </Text>
                          <TextInput
                            value={it.comentario || ""}
                            onChangeText={(v) =>
                              updateCartItem(it.sku, { comentario: v })
                            }
                            placeholder="Comentario (opcional)"
                            placeholderTextColor={colors.textDim}
                            style={styles.commentInput}
                          />
                        </View>
                        <View style={styles.qtyBox}>
                          <TouchableOpacity
                            testID={`qty-minus-${it.sku}`}
                            onPress={() =>
                              updateCartItem(it.sku, {
                                cantidad: Math.max(1, it.cantidad - 1),
                              })
                            }
                            style={styles.qtyBtn}
                          >
                            <Ionicons name="remove" size={14} color={colors.textMain} />
                          </TouchableOpacity>
                          <Text style={styles.qtyValue}>{it.cantidad}</Text>
                          <TouchableOpacity
                            testID={`qty-plus-${it.sku}`}
                            onPress={() =>
                              updateCartItem(it.sku, { cantidad: it.cantidad + 1 })
                            }
                            style={styles.qtyBtn}
                          >
                            <Ionicons name="add" size={14} color={colors.textMain} />
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          testID={`remove-${it.sku}`}
                          onPress={() => removeFromCart(it.sku)}
                          style={styles.delIcon}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Urgencia</Text>
                <View style={styles.urgRow}>
                  {[
                    { v: "normal", l: "Normal", c: colors.completed },
                    { v: "media", l: "Media", c: colors.pending },
                    { v: "alta", l: "Alta", c: colors.danger },
                  ].map((u) => {
                    const active = urgencia === u.v;
                    return (
                      <TouchableOpacity
                        key={u.v}
                        testID={`urg-${u.v}`}
                        onPress={() => setUrgencia(u.v as any)}
                        style={[
                          styles.urgChip,
                          active && { backgroundColor: `${u.c}1a`, borderColor: u.c },
                        ]}
                      >
                        <Text style={[styles.urgText, active && { color: u.c, fontWeight: "800" }]}>
                          {u.l}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.cardTitle}>Notas (opcional)</Text>
                <TextInput
                  testID="notas-input"
                  value={notas}
                  onChangeText={setNotas}
                  placeholder="Detalles adicionales sobre la solicitud..."
                  placeholderTextColor={colors.textDim}
                  multiline
                  numberOfLines={3}
                  style={styles.notasInput}
                />
              </View>

              <Btn
                title={`Enviar solicitud${cart.length ? ` (${cart.length} items)` : ""}`}
                onPress={submit}
                loading={submitting}
                variant="primary"
                testID="submit-solicitud"
              />
            </View>
          )}

          {/* ===== STOCK ===== */}
          {tab === "stock" && (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.sectionTitle}>Mi stock actual</Text>
              {stock.length === 0 ? (
                <View style={styles.card}>
                  <View style={styles.emptyCart}>
                    <Ionicons name="cube-outline" size={40} color={colors.textDim} />
                    <Text style={styles.emptyText}>No tienes stock asignado.</Text>
                    <Text style={styles.emptySub}>
                      Tu admin debe asignarte productos en bodega.
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.card}>
                  {stock.map((s) => (
                    <View key={s.id} style={styles.stockRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemSku}>SKU {s.sku}</Text>
                        <Text style={styles.itemDesc} numberOfLines={1}>
                          {s.descripcion}
                        </Text>
                      </View>
                      <View style={[styles.stockQty, s.cantidad < 3 && { backgroundColor: `${colors.pending}1a` }]}>
                        <Text
                          style={[
                            styles.stockQtyText,
                            s.cantidad < 3 && { color: colors.pending },
                          ]}
                        >
                          {s.cantidad}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ===== HISTORIAL ===== */}
          {tab === "historial" && (
            <View style={{ gap: spacing.md }}>
              {solicitudes.length === 0 ? (
                <View style={styles.card}>
                  <View style={styles.emptyCart}>
                    <Ionicons name="time-outline" size={40} color={colors.textDim} />
                    <Text style={styles.emptyText}>Aún no has enviado solicitudes.</Text>
                  </View>
                </View>
              ) : (
                solicitudes.map((s) => (
                  <View key={s.id} style={styles.card} testID={`mi-sol-${s.id}`}>
                    <View style={styles.solHead}>
                      <Text style={styles.solDate}>{formatDate(s.fecha)}</Text>
                      <View
                        style={[
                          styles.estadoBadge,
                          {
                            backgroundColor:
                              s.estado === "atendida"
                                ? `${colors.completed}1a`
                                : s.estado === "rechazada"
                                ? `${colors.danger}1a`
                                : `${colors.pending}1a`,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.estadoText,
                            {
                              color:
                                s.estado === "atendida"
                                  ? colors.completed
                                  : s.estado === "rechazada"
                                  ? colors.danger
                                  : colors.pending,
                            },
                          ]}
                        >
                          {s.estado.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={{ gap: 4, marginTop: spacing.sm }}>
                      {s.items.map((it: any, i: number) => (
                        <Text key={i} style={styles.itemLine} numberOfLines={1}>
                          • {it.sku} · {it.descripcion} <Text style={{ color: colors.primary, fontWeight: "700" }}>x{it.cantidad}</Text>
                        </Text>
                      ))}
                    </View>
                    {s.notas && (
                      <Text style={styles.solNotes}>📝 {s.notas}</Text>
                    )}
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Picker modal */}
      <FormSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Agregar producto"
        testID="picker-sheet"
      >
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            testID="picker-search"
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder="Buscar por SKU o descripción"
            placeholderTextColor={colors.textDim}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>
        {productosFiltrados.length === 0 ? (
          <Text style={styles.emptyText}>Sin resultados</Text>
        ) : (
          productosFiltrados.map((p) => (
            <TouchableOpacity
              key={p.id}
              testID={`prod-pick-${p.sku}`}
              onPress={() => addToCart(p)}
              style={styles.prodRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.prodSku}>SKU {p.sku}</Text>
                <Text style={styles.prodDesc} numberOfLines={1}>
                  {p.descripcion}
                </Text>
                {p.categoria && (
                  <Text style={styles.prodCat}>{p.categoria}</Text>
                )}
              </View>
              <Ionicons name="add-circle" size={24} color={colors.primary} />
            </TouchableOpacity>
          ))
        )}
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
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  tabsRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  tabActive: { backgroundColor: colors.primarySoft },
  tabLabel: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "600" },
  tabLabelActive: { color: colors.primary, fontWeight: "700" },

  content: { padding: spacing.lg, paddingBottom: 80, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  cardTitle: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  sectionTitle: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.sm },
  emptyCart: { alignItems: "center", padding: spacing.xl, gap: spacing.sm },
  emptyText: { color: colors.textMain, fontSize: fontSize.md, fontWeight: "600" },
  emptySub: { color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center" },

  cartItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  itemSku: { color: colors.accent, fontWeight: "700", fontSize: fontSize.xs, fontFamily: "monospace" as any },
  itemDesc: { color: colors.textMain, fontSize: fontSize.sm, marginTop: 2 },
  commentInput: {
    color: colors.textMain,
    fontSize: fontSize.xs,
    marginTop: 6,
    paddingVertical: 4,
    outlineStyle: "none" as any,
  },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyValue: { color: colors.textMain, fontWeight: "800", fontSize: fontSize.sm, minWidth: 18, textAlign: "center" },
  delIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: `${colors.danger}11`,
    alignItems: "center",
    justifyContent: "center",
  },

  urgRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  urgChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  urgText: { color: colors.textMuted, fontSize: fontSize.sm, fontWeight: "600" },

  notasInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.textMain,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    minHeight: 80,
    textAlignVertical: "top",
    outlineStyle: "none" as any,
  },

  // Stock
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  stockQty: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: `${colors.completed}1a`,
    minWidth: 40,
    alignItems: "center",
  },
  stockQtyText: { color: colors.completed, fontWeight: "800", fontSize: fontSize.md },

  // Historial
  solHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  solDate: { color: colors.textMuted, fontSize: fontSize.xs },
  estadoBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full },
  estadoText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.4 },
  itemLine: { color: colors.textMain, fontSize: fontSize.sm },
  solNotes: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: spacing.sm, fontStyle: "italic" },

  // Picker
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textMain, fontSize: fontSize.sm, outlineStyle: "none" as any },
  prodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  prodSku: { color: colors.accent, fontWeight: "700", fontSize: fontSize.xs, fontFamily: "monospace" as any },
  prodDesc: { color: colors.textMain, fontSize: fontSize.sm, marginTop: 2 },
  prodCat: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
});
