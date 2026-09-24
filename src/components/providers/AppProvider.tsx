"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  activeColors,
  encodeSettingsCookie,
  fontVar,
  sanitizeSettings,
  SETTINGS_COOKIE,
  SETTINGS_STORAGE,
  type Settings,
} from "@/lib/settings";
import { THEME_VARS, COLOR_KEYS, type ThemeColors } from "@/lib/themes";
import { api, writeCookie } from "@/lib/client/api";

export interface CurrentUser {
  id: string;
  username: string;
}

interface AppCtx {
  user: CurrentUser | null;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  replace: (s: Settings) => void;
  previewTheme: (c: ThemeColors | null) => void;
  paletteOpen: boolean;
  openPalette: (query?: string) => void;
  closePalette: () => void;
  paletteQuery: string;
}

const Ctx = createContext<AppCtx | null>(null);
const STAMP_KEY = "st_settings_at";

export function applyToDocument(s: Settings, preview?: ThemeColors | null) {
  const d = document.documentElement;
  const c = preview ?? activeColors(s);
  for (const k of COLOR_KEYS) d.style.setProperty(THEME_VARS[k], c[k]);
  d.style.setProperty("--typing-font", fontVar(s.fontFamily));
  d.style.setProperty("--font-size", `${s.fontSize}rem`);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", c.bg);
}

function persistLocal(s: Settings, at: number) {
  try {
    localStorage.setItem(SETTINGS_STORAGE, JSON.stringify(s));
    localStorage.setItem(STAMP_KEY, String(at));
  } catch {
    /* storage unavailable */
  }
  writeCookie(SETTINGS_COOKIE, encodeSettingsCookie(s));
}

export function AppProvider({
  user,
  initialSettings,
  serverSettings,
  children,
}: {
  user: CurrentUser | null;
  initialSettings: Settings;
  serverSettings: { settings: unknown; at: number } | null;
  children: React.ReactNode;
}) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pushToServer = useCallback(
    (s: Settings, at: number) => {
      if (!user) return;
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        void api("/api/settings", { method: "PUT", body: { settings: s, at } });
      }, 800);
    },
    [user],
  );

  // Reconcile with localStorage and the account copy after hydration.
  useEffect(() => {
    let local: Settings | null = null;
    let localAt = 0;
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE);
      if (raw) local = sanitizeSettings(JSON.parse(raw));
      localAt = Number(localStorage.getItem(STAMP_KEY) ?? 0) || 0;
    } catch {
      /* ignore */
    }
    let next = local ?? settingsRef.current;
    let nextAt = localAt;
    if (serverSettings && serverSettings.at > localAt) {
      next = sanitizeSettings(serverSettings.settings);
      nextAt = serverSettings.at;
    } else if (user && (!serverSettings || localAt > serverSettings.at)) {
      pushToServer(next, localAt || Date.now());
    }
    if (JSON.stringify(next) !== JSON.stringify(settingsRef.current)) {
      setSettings(next);
      applyToDocument(next);
    }
    persistLocal(next, nextAt || Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replace = useCallback(
    (s: Settings) => {
      const clean = sanitizeSettings(s);
      const at = Date.now();
      setSettings(clean);
      applyToDocument(clean);
      persistLocal(clean, at);
      pushToServer(clean, at);
    },
    [pushToServer],
  );

  const update = useCallback((patch: Partial<Settings>) => replace({ ...settingsRef.current, ...patch }), [replace]);

  const previewTheme = useCallback((c: ThemeColors | null) => applyToDocument(settingsRef.current, c), []);

  const openPalette = useCallback((q = "") => {
    setPaletteQuery(q);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    applyToDocument(settingsRef.current);
  }, []);

  const value = useMemo(
    () => ({ user, settings, update, replace, previewTheme, paletteOpen, openPalette, closePalette, paletteQuery }),
    [user, settings, update, replace, previewTheme, paletteOpen, openPalette, closePalette, paletteQuery],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}

export const useSettings = () => {
  const { settings, update } = useApp();
  return [settings, update] as const;
};
