import React, { useEffect, useRef } from "react";
import { Animated, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fontSize } from "@/src/theme";

type ToastType = "success" | "error" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  onHide?: () => void;
}

let toastSetter: ((opts: { message: string; type?: ToastType }) => void) | null =
  null;

export const showToast = (message: string, type: ToastType = "info") => {
  toastSetter?.({ message, type });
};

export const ToastHost: React.FC = () => {
  const [state, setState] = React.useState<{
    message: string;
    type?: ToastType;
  } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    toastSetter = (s) => {
      setState(s);
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setState(null));
    };
    return () => {
      toastSetter = null;
    };
  }, [opacity]);

  if (!state) return null;
  const bg =
    state.type === "success"
      ? colors.completed
      : state.type === "error"
      ? colors.danger
      : colors.primary;
  const iconName =
    state.type === "success"
      ? "checkmark-circle"
      : state.type === "error"
      ? "alert-circle"
      : "information-circle";

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="none">
      <View style={[styles.toast, { borderColor: bg }]}>
        <Ionicons name={iconName as any} size={20} color={bg} />
        <Text style={styles.msg}>{state.message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: "90%",
  },
  msg: { color: colors.textMain, fontSize: fontSize.sm, flex: 1 },
});
