import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { colors, spacing, radius, fontSize, MVG_LOGO_URL } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

const NAV: { label: string; icon: any; route: string; match: string[] }[] = [
  { label: "Inicio", icon: "grid-outline", route: "/(admin)/dashboard", match: ["/dashboard", "/(admin)/dashboard"] },
  { label: "Órdenes", icon: "clipboard-outline", route: "/(admin)/ordenes", match: ["/ordenes", "/(admin)/ordenes"] },
  { label: "Clientes", icon: "business-outline", route: "/(admin)/clientes", match: ["/clientes", "/(admin)/clientes"] },
  { label: "Comercios", icon: "storefront-outline", route: "/(admin)/comercios", match: ["/comercios", "/(admin)/comercios"] },
  { label: "Técnicos", icon: "people-outline", route: "/(admin)/tecnicos", match: ["/tecnicos", "/(admin)/tecnicos"] },
];

export const SIDEBAR_WIDTH = 256;

export const AdminSidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { user, logout } = useAuth();

  const isActive = (item: (typeof NAV)[number]) =>
    item.match.some((m) => pathname.startsWith(m));

  return (
    <View style={styles.wrap} testID="admin-sidebar">
      {/* Brand */}
      <View style={styles.brand}>
        <View style={styles.brandLogoWrap}>
          <Image source={{ uri: MVG_LOGO_URL }} style={styles.brandLogo} resizeMode="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandTitle}>MVG</Text>
          <Text style={styles.brandSub}>Computación</Text>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Section label */}
      <Text style={styles.sectionLabel}>MENÚ</Text>

      <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }} showsVerticalScrollIndicator={false}>
        {NAV.map((item) => {
          const active = isActive(item);
          return (
            <TouchableOpacity
              key={item.route}
              testID={`sidebar-${item.label.toLowerCase()}`}
              style={[styles.navItem, active && styles.navItemActive]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              {active && <View style={styles.activeBar} />}
              <Ionicons
                name={item.icon}
                size={19}
                color={active ? colors.sidebarTextActive : colors.sidebarText}
              />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Footer: user card */}
      <View style={styles.footer}>
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(user?.nombre?.[0] || "A").toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>
              {user?.nombre || "Admin"} {user?.apellidos || ""}
            </Text>
            <Text style={styles.userEmail} numberOfLines={1}>
              {user?.email || "admin@mvg.cl"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={logout}
            testID="sidebar-logout"
            style={styles.logoutBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={18} color={colors.sidebarText} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.sidebarBg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.sidebarBorder,
    height: "100%",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  brandLogoWrap: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  brandLogo: { width: 32, height: 22 },
  brandTitle: {
    color: colors.sidebarTextActive,
    fontSize: fontSize.lg,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  brandSub: {
    color: colors.sidebarText,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginVertical: spacing.md,
  },
  sectionLabel: {
    color: colors.sidebarText,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    opacity: 0.7,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.md,
    marginBottom: 2,
    position: "relative",
  },
  navItemActive: {
    backgroundColor: colors.sidebarActiveBg,
  },
  activeBar: {
    position: "absolute",
    left: -spacing.md - 1,
    top: 8,
    bottom: 8,
    width: 3,
    backgroundColor: colors.accent,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  navLabel: {
    color: colors.sidebarText,
    fontSize: fontSize.sm,
    fontWeight: "500",
  },
  navLabelActive: {
    color: colors.sidebarTextActive,
    fontWeight: "700",
  },
  footer: {
    marginTop: "auto",
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: fontSize.sm },
  userName: {
    color: colors.sidebarTextActive,
    fontSize: fontSize.sm,
    fontWeight: "700",
  },
  userEmail: {
    color: colors.sidebarText,
    fontSize: 11,
    marginTop: 1,
  },
  logoutBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
