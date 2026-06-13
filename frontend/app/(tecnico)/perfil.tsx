import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { StickyHeader } from "@/src/components/StickyHeader";
import { colors, spacing, radius, fontSize } from "@/src/theme";

export default function PerfilTecnico() {
  const { user, logout } = useAuth();

  if (!user) return null;
  const initials = `${user.nombre?.[0] || ""}${
    user.apellidos?.[0] || ""
  }`.toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <StickyHeader title="Mi perfil" />
      <View style={styles.content}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>
          {user.nombre} {user.apellidos}
        </Text>
        <Text style={styles.role}>Técnico de campo</Text>

        <View style={styles.card}>
          <Row icon="mail-outline" label="Email" value={user.email} />
          {user.rut && (
            <Row icon="card-outline" label="RUT" value={user.rut} />
          )}
          {user.telefono && (
            <Row icon="call-outline" label="Teléfono" value={user.telefono} />
          )}
        </View>

        <TouchableOpacity
          testID="logout-button"
          style={styles.logoutBtn}
          onPress={logout}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const Row: React.FC<{ icon: any; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <View style={styles.row}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={16} color={colors.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, alignItems: "center" },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.lg,
  },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  name: {
    color: colors.textMain,
    fontSize: fontSize.xxl,
    fontWeight: "800",
    marginTop: spacing.lg,
  },
  role: { color: colors.accent, fontSize: fontSize.sm, marginBottom: spacing.xl },
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: `${colors.accent}22`,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { color: colors.textDim, fontSize: fontSize.xs },
  rowValue: { color: colors.textMain, fontSize: fontSize.sm, fontWeight: "500" },
  logoutBtn: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: `${colors.danger}15`,
    borderColor: `${colors.danger}55`,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
});
