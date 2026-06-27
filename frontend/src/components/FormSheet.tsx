import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useResponsive } from "@/src/hooks/useResponsive";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  testID?: string;
}

export const FormSheet: React.FC<Props> = ({
  visible,
  onClose,
  title,
  children,
  testID,
}) => {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();

  // ===== DESKTOP: centered modal card =====
  if (isDesktop) {
    return (
      <Modal
        visible={visible}
        animationType="fade"
        transparent
        onRequestClose={onClose}
      >
        <View style={styles.desktopBackdrop}>
          <View
            testID={testID}
            style={styles.desktopCard}
            // @ts-ignore – web only
            onClick={(e: any) => e.stopPropagation && e.stopPropagation()}
          >
            <View style={styles.desktopHeader}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                testID="form-sheet-close"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              // @ts-ignore - web specific: visible scrollbar
              style={styles.scrollWeb}
            >
              {children}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  }

  // ===== MOBILE: bottom sheet =====
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <View
            testID={testID}
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                testID="form-sheet-close"
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  // ----- mobile bottom sheet -----
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "90%",
    minHeight: "50%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.borderLight,
    alignSelf: "center",
    marginTop: spacing.md,
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.textMain, fontSize: fontSize.lg, fontWeight: "700" },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },

  // ----- desktop centered modal -----
  desktopBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  desktopCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    width: "100%",
    maxWidth: 560,
    maxHeight: "88%",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.lg,
  },
  desktopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  // @ts-ignore - web specific
  scrollWeb: {
    // Ensure native-like scrollbar shows on web
    // @ts-ignore
    scrollbarWidth: "thin" as any,
    // @ts-ignore
    scrollbarColor: `${colors.borderStrong} ${colors.surfaceAlt}` as any,
  },
});
