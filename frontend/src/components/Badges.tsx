import React from "react";
import { View, Text, StyleSheet } from "react-native";
import {
  colors,
  radius,
  spacing,
  fontSize,
  statusColor,
  statusLabels,
  priorityColor,
  priorityLabels,
} from "@/src/theme";

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const c = statusColor(status);
  return (
    <View
      testID={`status-badge-${status}`}
      style={[styles.badge, { backgroundColor: `${c}22`, borderColor: `${c}55` }]}
    >
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.txt, { color: c }]}>
        {statusLabels[status] || status}
      </Text>
    </View>
  );
};

export const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const c = priorityColor(priority);
  return (
    <View
      testID={`priority-badge-${priority}`}
      style={[styles.badge, { backgroundColor: `${c}22`, borderColor: `${c}55` }]}
    >
      <Text style={[styles.txt, { color: c }]}>
        ↑ {priorityLabels[priority] || priority}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    alignSelf: "flex-start",
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  txt: { fontSize: fontSize.xs, fontWeight: "700" },
});
