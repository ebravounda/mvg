import React from "react";
import { View, StyleSheet } from "react-native";
import { AdminSidebar, SIDEBAR_WIDTH } from "./AdminSidebar";
import { colors } from "@/src/theme";

interface Props {
  children: React.ReactNode;
}

/**
 * Desktop admin shell: Fixed sidebar + scrollable content area.
 * Use this only on desktop. Mobile uses bottom tabs.
 */
export const AdminShell: React.FC<Props> = ({ children }) => {
  return (
    <View style={styles.shell}>
      <AdminSidebar />
      <View style={styles.content}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.background,
    minHeight: "100%" as any,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
    minWidth: 0,
  },
});

export { SIDEBAR_WIDTH };
