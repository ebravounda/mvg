import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, fontSize, MVG_LOGO_DARK, radius } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { useResponsive } from "@/src/hooks/useResponsive";

interface Props {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
}

export const StickyHeader: React.FC<Props> = ({
  title,
  subtitle,
  showBack,
  rightSlot,
}) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { isDesktop } = useResponsive();

  // ===== DESKTOP: clean topbar (no logo - sidebar has it; no logout - sidebar has it) =====
  if (isDesktop) {
    return (
      <View style={styles.desktopWrap}>
        <View style={styles.desktopInner}>
          <View style={styles.left}>
            {showBack && router.canGoBack() ? (
              <TouchableOpacity
                testID="header-back-button"
                onPress={() => router.back()}
                style={styles.iconBtnDesktop}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textMain} />
              </TouchableOpacity>
            ) : null}
            <View style={{ flex: 1 }}>
              {title ? (
                <Text style={styles.desktopTitle} numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text style={styles.desktopSubtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={styles.right}>{rightSlot}</View>
        </View>
      </View>
    );
  }

  // ===== MOBILE: original sticky header with logo + avatar =====
  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          {showBack ? (
            <TouchableOpacity
              testID="header-back-button"
              onPress={() => router.back()}
              style={styles.iconBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textMain} />
            </TouchableOpacity>
          ) : (
            <Image
              source={{ uri: MVG_LOGO_DARK }}
              style={styles.logo}
              resizeMode="contain"
            />
          )}
          {title ? (
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          {rightSlot}
          {user && (
            <TouchableOpacity
              testID="header-logout-button"
              onPress={logout}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>
                {(user.nombre?.[0] || "U").toUpperCase()}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // mobile
  wrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.md,
  },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logoBadge: { width: 0, height: 0 },
  logo: {
    width: 60,
    height: 44,
  },
  title: {
    color: colors.textMain,
    fontSize: fontSize.lg,
    fontWeight: "700",
    flex: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700" },

  // desktop
  desktopWrap: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  desktopInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 18,
    minHeight: 68,
    gap: spacing.lg,
  },
  desktopTitle: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  desktopSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  iconBtnDesktop: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
