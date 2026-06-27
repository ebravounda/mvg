import { useEffect, useState } from "react";
import { Dimensions, Platform } from "react-native";

export interface ResponsiveInfo {
  width: number;
  isDesktop: boolean;
  isTablet: boolean;
  isPhone: boolean;
  isWeb: boolean;
  containerMaxWidth: number;
}

const TABLET_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;
const MAX_CONTAINER = 1280;

export function useResponsive(): ResponsiveInfo {
  const [width, setWidth] = useState(() => Dimensions.get("window").width);

  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  const isWeb = Platform.OS === "web";
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const isTablet = width >= TABLET_BREAKPOINT && width < DESKTOP_BREAKPOINT;
  const isPhone = width < TABLET_BREAKPOINT;

  return {
    width,
    isDesktop,
    isTablet,
    isPhone,
    isWeb,
    containerMaxWidth: isDesktop ? MAX_CONTAINER : width,
  };
}
