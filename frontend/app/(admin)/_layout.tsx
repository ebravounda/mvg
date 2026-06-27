import { Tabs, Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, ActivityIndicator, Image, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";
import { colors, MVG_LOGO_URL } from "@/src/theme";

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

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarPosition: isDesktop ? "left" : "bottom",
        tabBarLabelPosition: isDesktop ? "beside-icon" : "below-icon",
        tabBarStyle: isDesktop
          ? {
              width: 240,
              backgroundColor: colors.surfaceAlt,
              borderRightWidth: 1,
              borderRightColor: colors.border,
              borderTopWidth: 0,
              paddingTop: 24,
              paddingHorizontal: 8,
            }
          : {
              backgroundColor: colors.surfaceAlt,
              borderTopColor: colors.border,
              height: 60 + insets.bottom,
              paddingBottom: insets.bottom + 6,
              paddingTop: 6,
            },
        tabBarItemStyle: isDesktop
          ? {
              height: 48,
              borderRadius: 10,
              marginBottom: 4,
              justifyContent: "flex-start",
              paddingHorizontal: 14,
            }
          : undefined,
        tabBarLabelStyle: isDesktop
          ? { fontSize: 14, fontWeight: "600", marginLeft: 8 }
          : { fontSize: 11, fontWeight: "600" },
        tabBarBackground: isDesktop
          ? () => (
              <View
                style={{
                  flex: 1,
                  backgroundColor: colors.surfaceAlt,
                  paddingHorizontal: 16,
                  paddingTop: 28,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  <Image
                    source={{ uri: MVG_LOGO_URL }}
                    style={{ width: 50, height: 28 }}
                    resizeMode="contain"
                  />
                  <View>
                    <Text
                      style={{ color: colors.textMain, fontWeight: "800", fontSize: 14 }}
                    >
                      MVG
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>
                      Computación
                    </Text>
                  </View>
                </View>
              </View>
            )
          : undefined,
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
