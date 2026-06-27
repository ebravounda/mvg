import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getDeadlineInfo } from "@/src/utils/deadline";
import { spacing, radius, fontSize } from "@/src/theme";

interface Props {
  fechaLimite?: string | null;
  size?: "sm" | "md";
}

export const DeadlineBadge: React.FC<Props> = ({ fechaLimite, size = "sm" }) => {
  const info = getDeadlineInfo(fechaLimite);
  if (info.status === "none") return null;
  const isMd = size === "md";
  return (
    <View
      testID={`deadline-${info.status}`}
      style={[
        styles.wrap,
        {
          backgroundColor: info.bg,
          borderColor: info.border,
          paddingHorizontal: isMd ? spacing.md : 8,
          paddingVertical: isMd ? 6 : 3,
        },
      ]}
    >
      <Ionicons
        name={
          info.status === "overdue"
            ? "alert-circle"
            : info.status === "warning"
            ? "time"
            : "calendar"
        }
        size={isMd ? 14 : 12}
        color={info.color}
      />
      <Text
        style={[
          styles.txt,
          {
            color: info.color,
            fontSize: isMd ? fontSize.sm : fontSize.xs,
          },
        ]}
      >
        {info.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  txt: { fontWeight: "700" },
});
