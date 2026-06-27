import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useResponsive } from "@/src/hooks/useResponsive";

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Container that constrains width on desktop while filling phone width.
 * Use as outer wrapper inside ScrollView/FlatList contentContainerStyle.
 */
export const PageContainer: React.FC<Props> = ({ children, style }) => {
  const { isDesktop, containerMaxWidth } = useResponsive();
  return (
    <View
      style={[
        styles.wrap,
        isDesktop && { maxWidth: containerMaxWidth, alignSelf: "center", width: "100%" },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { width: "100%" },
});
