import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, fontSize, shadow } from "@/src/theme";

interface Props {
  lat: number;
  lng: number;
  address?: string | null;
  accuracy?: number | null;
  height?: number;
  testID?: string;
}

/**
 * Cross-platform map preview. On web (admin panel) embeds an OpenStreetMap
 * iframe with a marker pin. On native, shows a card with coordinates + a
 * "Abrir en Mapas" button.
 *
 * Free, no API key required.
 */
export const LocationMap: React.FC<Props> = ({
  lat,
  lng,
  address,
  accuracy,
  height = 320,
  testID,
}) => {
  const openExternal = () => {
    const url =
      Platform.OS === "ios"
        ? `maps://?q=${lat},${lng}`
        : `geo:${lat},${lng}?q=${lat},${lng}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`);
    });
  };

  // Web: embed iframe via React DOM
  const isWeb = Platform.OS === "web";

  // Bounding box around the pin (~150 m)
  const d = 0.0015;
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  const osmEmbed = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const osmFull = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={18} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Ubicación de cierre</Text>
          {address ? (
            <Text style={styles.address} numberOfLines={2}>
              {address}
            </Text>
          ) : (
            <Text style={styles.address}>
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </Text>
          )}
          {accuracy ? (
            <Text style={styles.acc}>
              Precisión: ±{Math.round(accuracy)} m
            </Text>
          ) : null}
        </View>
      </View>

      {isWeb ? (
        // @ts-ignore - iframe is a valid web-only element
        React.createElement("iframe", {
          src: osmEmbed,
          width: "100%",
          height,
          style: {
            border: 0,
            borderRadius: radius.md,
            backgroundColor: "#e2e8f0",
          },
          title: "Mapa ubicación cierre",
          loading: "lazy",
        })
      ) : (
        <View style={[styles.fallback, { height }]}>
          <Ionicons name="map-outline" size={48} color={colors.textDim} />
          <Text style={styles.fallbackTxt}>Vista de mapa solo en web</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          testID="open-map-external"
          style={styles.btn}
          onPress={() => {
            if (isWeb && typeof window !== "undefined") {
              window.open(osmFull, "_blank");
            } else {
              openExternal();
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="open-outline" size={14} color={colors.primary} />
          <Text style={styles.btnText}>Abrir en OpenStreetMap</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="open-map-google"
          style={styles.btn}
          onPress={() => {
            const url = `https://www.google.com/maps/place/${lat},${lng}/@${lat},${lng},18z`;
            if (isWeb && typeof window !== "undefined") {
              window.open(url, "_blank");
            } else {
              Linking.openURL(url);
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="globe-outline" size={14} color={colors.primary} />
          <Text style={styles.btnText}>Google Maps</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    ...shadow.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.textMain, fontWeight: "700", fontSize: fontSize.md },
  address: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  acc: { color: colors.textDim, fontSize: fontSize.xs, marginTop: 2 },
  fallback: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  fallbackTxt: { color: colors.textMuted, fontSize: fontSize.sm },
  actions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  btnText: { color: colors.primary, fontWeight: "700", fontSize: fontSize.xs },
});
