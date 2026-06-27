import { Tabs, Redirect, Slot } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { AdminShell } from "@/src/components/AdminShell";
import { colors } from "@/src/theme";

export default function AdminLayout() {
  const { user, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();

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
  if (user.role !== "admin") return <Redirect href="/(tecnico)/ordenes" />;

  // ===== DESKTOP: custom sidebar shell =====
  if (isDesktop) {
    return (
      <AdminShell>
        <Slot />
      </AdminShell>
    );
  }

  // ===== MOBILE: bottom tabs =====
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ordenes"
        options={{
          title: "Órdenes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="clipboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: "Clientes",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="comercios"
        options={{
          title: "Comercios",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="storefront-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tecnicos"
        options={{
          title: "Técnicos",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
