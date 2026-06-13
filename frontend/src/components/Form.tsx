import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { colors, spacing, radius, fontSize } from "@/src/theme";

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  testID?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  secureTextEntry,
  multiline,
  autoCapitalize = "sentences",
  testID,
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textDim}
      style={[styles.input, multiline && { height: 90, textAlignVertical: "top" }]}
      keyboardType={keyboardType}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
    />
  </View>
);

interface SelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  testID?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  value,
  onChange,
  options,
  testID,
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.chipsRow}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <TouchableOpacity
            key={o.value}
            testID={`${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              selected && {
                backgroundColor: colors.primary,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                selected && { color: "#fff", fontWeight: "700" },
              ]}
            >
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
);

interface BtnProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "accent" | "outline" | "danger";
  testID?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export const Btn: React.FC<BtnProps> = ({
  title,
  onPress,
  loading,
  variant = "primary",
  testID,
  disabled,
  icon,
}) => {
  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "accent"
      ? colors.accent
      : variant === "danger"
      ? colors.danger
      : "transparent";
  const border =
    variant === "outline" ? colors.borderLight : "transparent";
  const color = "#fff";
  return (
    <TouchableOpacity
      testID={testID}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={loading || disabled}
      style={[
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: 1 },
        (loading || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon}
          <Text style={[styles.btnText, { color }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fieldWrap: { gap: 6 },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 48,
    color: colors.textMain,
    fontSize: fontSize.md,
  },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textMuted, fontSize: fontSize.sm },
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontWeight: "700", fontSize: fontSize.md },
});
