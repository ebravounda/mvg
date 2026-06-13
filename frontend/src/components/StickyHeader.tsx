import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, fontSize, MVG_LOGO_URL, radius } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";

interface Props {
  title?: string;
  showBack?: boolean;
  rightSlot?: React.ReactNode;
}

export const StickyHeader: React.FC<Props> = ({ title, showBack, rightSlot }) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

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
              source={{ uri: MVG_LOGO_URL }}
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
  wrap: {
    backgroundColor: colors.surfaceAlt,
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
  logo: { width: 70, height: 34 },
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
    backgroundColor: colors.surface,
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
});
