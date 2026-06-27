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
import { useResponsive } from "@/src/hooks/useResponsive";
import {
  colors,
  spacing,
  radius,
  fontSize,
  shadow,
  MVG_LOGO_LIGHT,
  MVG_LOGO_DARK,
} from "@/src/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const { isDesktop } = useResponsive();
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
        e?.response?.data?.detail ||
          "Credenciales incorrectas. Verifica tus datos."
      );
    } finally {
      setLoading(false);
    }
  };

  // ===== FORM CARD (shared) =====
  const FormCard = (
    <View style={[styles.card, isDesktop && styles.cardDesktop]}>
      {!isDesktop && (
        <View style={styles.mobileBrand}>
          <Image
            source={{ uri: MVG_LOGO_DARK }}
            style={styles.mobileLogo}
            resizeMode="contain"
            testID="login-logo"
          />
        </View>
      )}

      <Text style={styles.title} testID="login-title">
        Iniciar sesión
      </Text>
      <Text style={styles.subtitle}>
        Accede al panel de gestión de órdenes
      </Text>

      <View style={styles.form}>
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Correo electrónico</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
            <TextInput
              testID="login-email-input"
              placeholder="tu@empresa.com"
              placeholderTextColor={colors.textDim}
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Contraseña</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={colors.textMuted}
            />
            <TextInput
              testID="login-password-input"
              placeholder="••••••••"
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
            <>
              <Text style={styles.btnText}>Iniciar sesión</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <View style={styles.hintBox}>
          <Ionicons name="key-outline" size={14} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.hintTitle}>Credenciales de prueba</Text>
            <Text style={styles.hintText}>admin@mvg.cl · Admin123!</Text>
          </View>
        </View>
      </View>

      <Text style={styles.footer}>
        © {new Date().getFullYear()} MVG Computación · Todos los derechos
        reservados
      </Text>
    </View>
  );

  // ===== DESKTOP: split layout =====
  if (isDesktop) {
    return (
      <View style={styles.desktopRoot} testID="login-desktop">
        {/* Left brand panel */}
        <View style={styles.brandPanel}>
          <View style={styles.brandPanelInner}>
            <View style={styles.brandHeader}>
              <Image
                source={{ uri: MVG_LOGO_LIGHT }}
                style={styles.brandLogo}
                resizeMode="contain"
              />
            </View>

            <View style={styles.brandHero}>
              <Text style={styles.brandH1}>
                Gestiona tus órdenes de servicio
              </Text>
              <Text style={styles.brandH1}>
                de forma <Text style={{ color: colors.accent }}>profesional</Text>
              </Text>
              <Text style={styles.brandLead}>
                Asigna técnicos, sube evidencias, notifica por WhatsApp y exporta
                reportes — todo en una sola plataforma.
              </Text>

              <View style={styles.featureList}>
                {[
                  { icon: "flash-outline", t: "Asignación instantánea con notificación WhatsApp" },
                  { icon: "camera-outline", t: "Captura de evidencias desde terreno" },
                  { icon: "document-text-outline", t: "Reportes PDF y CSV automáticos" },
                ].map((f, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={styles.featureIcon}>
                      <Ionicons name={f.icon as any} size={16} color={colors.accent} />
                    </View>
                    <Text style={styles.featureText}>{f.t}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={styles.brandFootnote}>
              Sistema interno · MVG Computación
            </Text>
          </View>
          {/* decorative blobs */}
          <View style={styles.blob1} />
          <View style={styles.blob2} />
        </View>

        {/* Right form area */}
        <View style={styles.formPanel}>
          <ScrollView
            contentContainerStyle={styles.formScroll}
            showsVerticalScrollIndicator={false}
          >
            {FormCard}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ===== MOBILE =====
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.mobileScroll}
          keyboardShouldPersistTaps="handled"
        >
          {FormCard}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // ---- DESKTOP split ----
  desktopRoot: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.background,
    minHeight: "100%" as any,
  },
  brandPanel: {
    flex: 1,
    backgroundColor: colors.sidebarBg,
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
  },
  brandPanelInner: {
    paddingHorizontal: 56,
    paddingVertical: 48,
    maxWidth: 620,
    width: "100%",
    alignSelf: "center",
    zIndex: 2,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: 56,
  },
  brandLogo: {
    width: 230,
    height: 230,
    ...(Platform.OS === "web"
      ? ({ mixBlendMode: "lighten" } as any)
      : {}),
  },
  brandName: {
    color: "#fff",
    fontWeight: "800",
    fontSize: fontSize.xl,
    letterSpacing: 0.5,
  },
  brandSub: {
    color: colors.sidebarText,
    fontSize: fontSize.sm,
  },
  brandHero: { gap: spacing.md },
  brandH1: {
    color: "#fff",
    fontSize: 40,
    fontWeight: "800",
    lineHeight: 48,
    letterSpacing: -0.8,
  },
  brandLead: {
    color: colors.sidebarText,
    fontSize: fontSize.md,
    lineHeight: 24,
    marginTop: spacing.md,
    maxWidth: 480,
  },
  featureList: { gap: spacing.md, marginTop: spacing.xl },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: "rgba(249,115,22,0.12)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: { color: "#E2E8F0", fontSize: fontSize.sm, flex: 1 },
  brandFootnote: {
    color: colors.sidebarText,
    fontSize: fontSize.xs,
    marginTop: 56,
    opacity: 0.6,
  },
  blob1: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 999,
    backgroundColor: "rgba(37,99,235,0.18)",
    top: -120,
    right: -120,
  },
  blob2: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: "rgba(249,115,22,0.10)",
    bottom: -100,
    left: -80,
  },

  formPanel: {
    flex: 1,
    backgroundColor: colors.background,
    minWidth: 0,
  },
  formScroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: spacing.xl,
  },

  // ---- MOBILE scroll ----
  mobileScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  mobileBrand: { alignItems: "center", marginBottom: spacing.xl },
  mobileLogo: {
    width: 200,
    height: 200,
    ...(Platform.OS === "web"
      ? ({ mixBlendMode: "multiply" } as any)
      : {}),
  },

  // ---- CARD ----
  card: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  cardDesktop: {
    maxWidth: 440,
    padding: 40,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.lg,
  },
  title: {
    color: colors.textMain,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
  },
  form: { gap: spacing.md },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    color: colors.textMain,
    fontSize: fontSize.xs,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  inputWrap: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  input: { flex: 1, color: colors.textMain, fontSize: fontSize.md, outlineStyle: "none" as any },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderColor: "rgba(220,38,38,0.25)",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errText: { color: colors.danger, fontSize: fontSize.sm, flex: 1 },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: fontSize.md },
  hintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accentSoft,
  },
  hintTitle: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  hintText: { color: colors.textMain, fontSize: fontSize.sm, marginTop: 2, fontWeight: "600" },
  footer: {
    color: colors.textDim,
    textAlign: "center",
    fontSize: 11,
    marginTop: spacing.md,
  },
});
