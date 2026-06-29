/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Field } from "@/src/components/Form";
import { api } from "@/src/api/client";
import { colors, spacing, radius, fontSize } from "@/src/theme";

interface Props {
  direccion: string;
  comuna: string;
  region: string;
  lat: number | null;
  lng: number | null;
  onChange: (next: {
    direccion: string;
    comuna: string;
    region: string;
    lat: number | null;
    lng: number | null;
  }) => void;
  testIDPrefix?: string;
}

/**
 * Campo combinado de dirección + comuna + región con geocoding automático
 * y previsualización en mapa OpenStreetMap.
 *
 * Cuando el usuario termina de escribir (debounce 800ms), llama a
 * `/admin/geocode` y actualiza `lat`/`lng` automáticamente. También
 * proporciona un botón explícito "Buscar en mapa".
 */
export function AddressGeocodeField({
  direccion,
  comuna,
  region,
  lat,
  lng,
  onChange,
  testIDPrefix = "geo",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doGeocode = useCallback(
    async (dir: string, com: string, reg: string) => {
      if (!dir || dir.trim().length < 4) {
        setError("");
        return;
      }
      setLoading(true);
      setError("");
      try {
        const r = await api.post("/admin/geocode", {
          direccion: dir,
          comuna: com || null,
          region: reg || null,
        });
        if (r.data?.ok) {
          onChange({
            direccion: dir,
            comuna: com,
            region: reg,
            lat: r.data.lat,
            lng: r.data.lng,
          });
          setDisplayName(r.data.display_name || "");
        } else {
          setError("No se encontraron coordenadas para esa dirección.");
          onChange({ direccion: dir, comuna: com, region: reg, lat: null, lng: null });
          setDisplayName("");
        }
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Error al geocodificar");
      } finally {
        setLoading(false);
      }
    },
    [onChange]
  );

  // Debounced auto-geocode al cambiar dirección/comuna/region
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (direccion && direccion.trim().length >= 4) {
        doGeocode(direccion, comuna, region);
      } else {
        // dirección demasiado corta → invalidar coords
        if (lat !== null || lng !== null) {
          onChange({ direccion, comuna, region, lat: null, lng: null });
        }
      }
    }, 900);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direccion, comuna, region]);

  const set = (patch: Partial<Pick<Props, "direccion" | "comuna" | "region">>) => {
    onChange({
      direccion: patch.direccion ?? direccion,
      comuna: patch.comuna ?? comuna,
      region: patch.region ?? region,
      // si cambia algo, invalidar coords temporalmente (debounce las recalcula)
      lat,
      lng,
    });
  };

  // OSM embed URL (zoomed in around the point with a marker)
  const osmEmbedUrl =
    lat !== null && lng !== null
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.005},${lat - 0.0035},${lng + 0.005},${lat + 0.0035}&layer=mapnik&marker=${lat},${lng}`
      : "";

  return (
    <View>
      <Field
        label="Dirección domicilio *"
        value={direccion}
        onChangeText={(v) => set({ direccion: v })}
        placeholder="Ej: Av. Providencia 1234"
        testID={`${testIDPrefix}-direccion`}
      />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field
            label="Comuna"
            value={comuna}
            onChangeText={(v) => set({ comuna: v })}
            placeholder="Ej: Providencia"
            testID={`${testIDPrefix}-comuna`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Región"
            value={region}
            onChangeText={(v) => set({ region: v })}
            placeholder="Ej: Metropolitana"
            testID={`${testIDPrefix}-region`}
          />
        </View>
      </View>

      {/* Estado del geocoding */}
      <View style={styles.statusBox} testID={`${testIDPrefix}-status`}>
        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.statusText}>Buscando coordenadas…</Text>
          </View>
        ) : lat !== null && lng !== null ? (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.completed} />
            <View style={{ flex: 1 }}>
              <Text style={styles.statusOk}>
                Coords: {lat.toFixed(5)}, {lng.toFixed(5)}
              </Text>
              {displayName ? (
                <Text style={styles.statusHint} numberOfLines={2}>
                  {displayName}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => doGeocode(direccion, comuna, region)}
              style={styles.refreshBtn}
              testID={`${testIDPrefix}-refresh`}
            >
              <Ionicons name="refresh" size={14} color={colors.primary} />
              <Text style={styles.refreshTxt}>Recalcular</Text>
            </TouchableOpacity>
          </View>
        ) : error ? (
          <View style={styles.statusRow}>
            <Ionicons name="warning" size={18} color={colors.pending} />
            <Text style={styles.statusError}>{error}</Text>
            <TouchableOpacity
              onPress={() => doGeocode(direccion, comuna, region)}
              style={styles.refreshBtn}
              testID={`${testIDPrefix}-retry`}
            >
              <Text style={styles.refreshTxt}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <Ionicons name="locate" size={18} color={colors.textMuted} />
            <Text style={styles.statusHint}>
              Las coordenadas se calculan automáticamente al ingresar la dirección.
            </Text>
          </View>
        )}
      </View>

      {/* Mapa OSM embebido (solo web; en mobile mostramos botón “ver en Maps”) */}
      {lat !== null && lng !== null && (
        Platform.OS === "web" ? (
          <View style={styles.mapContainer} testID={`${testIDPrefix}-map`}>
            {/* eslint-disable-next-line react/no-unknown-property */}
            <iframe
              src={osmEmbedUrl}
              style={{
                border: 0,
                width: "100%",
                height: 220,
                borderRadius: 8,
              }}
              title="Mapa OpenStreetMap"
            />
            <Text style={styles.mapAttr}>
              © OpenStreetMap contributors
            </Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.openMapBtn}
            onPress={() => {
              const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
              if (typeof window !== "undefined") {
                window.open(url, "_blank");
              }
            }}
            testID={`${testIDPrefix}-open-map`}
          >
            <Ionicons name="map" size={16} color={colors.primary} />
            <Text style={styles.openMapTxt}>Ver ubicación en mapa</Text>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  statusBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: { color: colors.textMain, fontSize: fontSize.sm },
  statusOk: { color: colors.completed, fontWeight: "700", fontSize: fontSize.sm },
  statusHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  statusError: { color: colors.pending, fontSize: fontSize.sm, flex: 1 },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#fff",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  refreshTxt: { color: colors.primary, fontSize: fontSize.xs, fontWeight: "700" },
  mapContainer: { marginBottom: spacing.md, gap: 4 },
  mapAttr: { color: colors.textMuted, fontSize: 10, textAlign: "right" },
  openMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  openMapTxt: { color: colors.primary, fontWeight: "700", fontSize: fontSize.sm },
});
