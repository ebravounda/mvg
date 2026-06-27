/**
 * Cross-platform geolocation helper (web + native via expo-location).
 *
 * Always requests permission first. Resolves with {lat, lng, accuracy} or
 * rejects with a user-friendly error message.
 */
import { Platform } from "react-native";
import * as Location from "expo-location";

export interface GeoResult {
  lat: number;
  lng: number;
  accuracy: number | null;
  address?: string | null;
}

export class GeoError extends Error {
  code:
    | "permission_denied"
    | "unavailable"
    | "timeout"
    | "unknown"
    | "insecure_context";
  constructor(msg: string, code: GeoError["code"]) {
    super(msg);
    this.code = code;
  }
}

async function getWeb(): Promise<GeoResult> {
  // @ts-ignore - navigator is web-only
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new GeoError(
      "Tu navegador no soporta geolocalización. Usa Chrome, Safari o Firefox.",
      "unavailable"
    );
  }
  // @ts-ignore - isSecureContext is a browser property
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new GeoError(
      "La geolocalización solo funciona en HTTPS. Si estás en HTTP local, abre la app vía https://",
      "insecure_context"
    );
  }
  return new Promise((resolve, reject) => {
    // @ts-ignore
    navigator.geolocation.getCurrentPosition(
      (pos: any) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        });
      },
      (err: any) => {
        if (err?.code === 1) {
          reject(
            new GeoError(
              "Has denegado el permiso de ubicación. Para finalizar la orden, autoriza la ubicación en la configuración del navegador.",
              "permission_denied"
            )
          );
        } else if (err?.code === 2) {
          reject(
            new GeoError(
              "Ubicación no disponible. Verifica que el GPS o WiFi estén activos.",
              "unavailable"
            )
          );
        } else if (err?.code === 3) {
          reject(
            new GeoError(
              "Tiempo agotado obteniendo tu ubicación. Intenta de nuevo.",
              "timeout"
            )
          );
        } else {
          reject(
            new GeoError(
              err?.message || "Error desconocido obteniendo ubicación",
              "unknown"
            )
          );
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

async function getNative(): Promise<GeoResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new GeoError(
      "Permiso de ubicación denegado. Para finalizar la orden, habilita la ubicación en los ajustes de tu dispositivo.",
      "permission_denied"
    );
  }
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    };
  } catch (e: any) {
    throw new GeoError(e?.message || "No se pudo obtener la ubicación", "unknown");
  }
}

/** Reverse-geocode lat/lng to a human readable address using OpenStreetMap Nominatim (free, no key) */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=es&zoom=18`,
      { headers: { Accept: "application/json" } as any }
    );
    if (!r.ok) return null;
    const j = await r.json();
    return j?.display_name || null;
  } catch {
    return null;
  }
}

/** Get current position + reverse-geocode in one call. */
export async function captureLocation(): Promise<GeoResult> {
  const base =
    Platform.OS === "web" ? await getWeb() : await getNative();
  const address = await reverseGeocode(base.lat, base.lng);
  return { ...base, address };
}
