import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api/client";
import { StickyHeader } from "@/src/components/StickyHeader";
import { StatusBadge, PriorityBadge } from "@/src/components/Badges";
import { Btn } from "@/src/components/Form";
import { showToast } from "@/src/components/Toast";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function OrdenDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [orden, setOrden] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const onDelete = async () => {
    try {
      await api.delete(`/admin/ordenes/${id}`);
      showToast("Orden eliminada", "success");
      router.back();
    } catch (e: any) {
      showToast(e?.response?.data?.detail || "Error eliminando", "error");
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

        <Section title="Cliente">
          <Row icon="business-outline" label="Nombre" value={orden.cliente?.nombre} />
          {orden.cliente?.rut && (
            <Row icon="card-outline" label="RUT" value={orden.cliente.rut} />
          )}
          {orden.cliente?.contacto && (
            <Row
              icon="person-outline"
              label="Contacto"
              value={orden.cliente.contacto}
            />
          )}
          {orden.cliente?.telefono && (
            <Row
              icon="call-outline"
              label="Teléfono"
              value={orden.cliente.telefono}
            />
          )}
        </Section>

        <Section title="Sucursal">
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
              label="Encargado"
              value={orden.sucursal.encargado}
            />
          )}
        </Section>

        <Section title="Técnico asignado">
          <Row
            icon="person-circle-outline"
            label="Nombre"
            value={
              orden.tecnico
                ? `${orden.tecnico.nombre} ${orden.tecnico.apellidos}`
                : "Sin asignar"
            }
          />
          {orden.tecnico?.email && (
            <Row icon="mail-outline" label="Email" value={orden.tecnico.email} />
          )}
          {orden.tecnico?.telefono && (
            <Row
              icon="call-outline"
              label="Teléfono"
              value={orden.tecnico.telefono}
            />
          )}
        </Section>

        <Section title="Descripción del problema">
          <Text style={styles.descripcion}>{orden.descripcion}</Text>
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
          </Section>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Btn
            title="Eliminar orden"
            variant="danger"
            onPress={onDelete}
            testID="eliminar-orden-btn"
            icon={<Ionicons name="trash-outline" size={18} color="#fff" />}
          />
        </View>
      </ScrollView>
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
});
