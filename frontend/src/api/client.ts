import axios from "axios";
import { storage } from "@/src/utils/storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

let cachedToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  cachedToken = token;
};

api.interceptors.request.use(async (config) => {
  if (!cachedToken) {
    cachedToken = await storage.secureGet<string>("mvg_token", "");
  }
  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    // Normalize Pydantic 422 validation errors (array of objects) into a single
    // human-readable string so showToast(detail) doesn't crash with
    // "Objects are not valid as a React child".
    const detail = err?.response?.data?.detail;
    if (Array.isArray(detail)) {
      err.response.data.detail = detail
        .map((d: any) => {
          if (typeof d === "string") return d;
          if (d?.msg) {
            const loc = Array.isArray(d.loc)
              ? d.loc.filter((p: any) => p !== "body").join(".")
              : "";
            return loc ? `${loc}: ${d.msg}` : d.msg;
          }
          try {
            return JSON.stringify(d);
          } catch {
            return String(d);
          }
        })
        .join(" · ");
    } else if (detail && typeof detail === "object") {
      err.response.data.detail =
        detail.msg ||
        (() => {
          try {
            return JSON.stringify(detail);
          } catch {
            return "Error";
          }
        })();
    }
    return Promise.reject(err);
  }
);
