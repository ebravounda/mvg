import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { colors, spacing, radius, fontSize, MVG_LOGO_URL } from "@/src/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Ingresa email y contraseña");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setError(
        e?.response?.data?.detail || "Credenciales incorrectas. Verifica tus datos."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBox}>
            <Image
              source={{ uri: MVG_LOGO_URL }}
              style={styles.logo}
              resizeMode="contain"
              testID="login-logo"
            />
          </View>

          <Text style={styles.title} testID="login-title">
            Bienvenido
          </Text>
          <Text style={styles.subtitle}>
            Sistema de gestión de órdenes de servicio
          </Text>

          <View style={styles.form}>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <TextInput
                testID="login-email-input"
                placeholder="Correo electrónico"
                placeholderTextColor={colors.textDim}
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={colors.textMuted}
              />
              <TextInput
                testID="login-password-input"
                placeholder="Contraseña"
                placeholderTextColor={colors.textDim}
                value={password}
                onChangeText={setPassword}
                style={styles.input}
                secureTextEntry={!showPwd}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPwd((v) => !v)}>
                <Ionicons
                  name={showPwd ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>

            {error && (
              <View style={styles.errBox} testID="login-error">
                <Ionicons name="alert-circle" size={16} color={colors.danger} />
                <Text style={styles.errText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              testID="login-submit-button"
              activeOpacity={0.85}
              style={[styles.btn, loading && { opacity: 0.7 }]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.btnText}>Iniciar sesión</Text>
              )}
            </TouchableOpacity>

            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>Credenciales de prueba</Text>
              <Text style={styles.hintText}>admin@mvg.cl / Admin123!</Text>
            </View>
          </View>

          <Text style={styles.footer}>
            © {new Date().getFullYear()} MVG Computación
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    justifyContent: "center",
  },
  logoBox: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  logo: { width: 220, height: 130 },
  title: {
    color: colors.textMain,
    fontSize: fontSize.xxxl,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  form: { gap: spacing.md },
  inputWrap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  input: { flex: 1, color: colors.textMain, fontSize: fontSize.md },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(239,68,68,0.12)",
    borderColor: "rgba(239,68,68,0.3)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errText: { color: colors.danger, fontSize: fontSize.sm, flex: 1 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.sm,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
  hintBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  hintTitle: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  hintText: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 },
  footer: {
    color: colors.textDim,
    textAlign: "center",
    fontSize: fontSize.xs,
    marginTop: spacing.xl,
  },
});
