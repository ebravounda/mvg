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
    // surface friendly errors
    return Promise.reject(err);
  }
);
