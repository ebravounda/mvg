import { Tabs, Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius, fontSize } from "@/src/theme";
import { showToast } from "@/src/components/Toast";

export default function TecnicoLayout() {
  const { user, loading, isImpersonating, endImpersonation } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "tecnico") return <Redirect href="/(admin)/dashboard" />;

  const onReturnToAdmin = async () => {
    try {
      await endImpersonation();
      showToast("Sesión de admin restaurada", "success");
      router.replace("/(admin)/dashboard" as any);
    } catch (e: any) {
      showToast(e?.message || "No se pudo volver al admin", "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Impersonation banner — only visible when admin viewing as técnico */}
      {isImpersonating && (
        <View
          style={[
            bannerStyles.banner,
            { paddingTop: insets.top + 10 },
          ]}
          testID="impersonation-banner"
        >
          <Ionicons name="eye-outline" size={16} color="#fff" />
          <Text style={bannerStyles.text} numberOfLines={2}>
            Estás viendo la app como{" "}
            <Text style={{ fontWeight: "800" }}>
              {user.nombre} {user.apellidos}
            </Text>
          </Text>
          <TouchableOpacity
            onPress={onReturnToAdmin}
            style={bannerStyles.btn}
            activeOpacity={0.8}
            testID="impersonation-return-btn"
          >
            <Ionicons name="arrow-back" size={12} color="#fff" />
            <Text style={bannerStyles.btnText}>Volver a admin</Text>
          </TouchableOpacity>
        </View>
      )}

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600", paddingBottom: 2 },
          tabBarIconStyle: { marginTop: 2 },
          tabBarStyle: {
            backgroundColor: colors.surfaceAlt,
            borderTopColor: colors.border,
            // On web/PWA the bottom safe-area can be 0 even when the browser
            // chrome (Safari URL bar) overlaps the bottom — add a generous
            // baseline padding so the icons + labels are never clipped.
            height: 64 + Math.max(insets.bottom, Platform.OS === "web" ? 24 : 0),
            paddingBottom: Math.max(insets.bottom, Platform.OS === "web" ? 24 : 6) + 4,
            paddingTop: 6,
          },
        }}
      >
        <Tabs.Screen
          name="ordenes"
          options={{
            title: "Mis órdenes",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="clipboard-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="suministros"
          options={{
            title: "Suministros",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="cube-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="perfil"
          options={{
            title: "Perfil",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  banner: {
    backgroundColor: colors.accent,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    ...Platform.select({
      web: {
        // Sticky on web preview top
        position: "relative" as any,
      },
    }),
  },
  text: { color: "#fff", fontSize: fontSize.xs, flex: 1 },
  btn: {
    backgroundColor: "rgba(0,0,0,0.25)",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.xs },
});
