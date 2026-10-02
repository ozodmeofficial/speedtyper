"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";

const CommandPalette = dynamic(() => import("./CommandPalette").then((m) => m.CommandPalette), { ssr: false });

/** Global shortcut (esc / ctrl+k / ctrl+shift+p) + lazily loaded command palette. */
export function PaletteHost() {
  const { paletteOpen, openPalette, settings } = useApp();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const key = e.key.toLowerCase();
      const combo = (e.ctrlKey || e.metaKey) && ((e.shiftKey && key === "p") || (!e.shiftKey && !e.altKey && key === "k"));
      const esc = e.key === "Escape" && settings.quickRestart !== "esc";
      if (!combo && !esc) return;
      const el = document.activeElement as HTMLElement | null;
      const typingField = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") && !el.dataset.typingInput;
      if (esc && (typingField || document.querySelector("[data-modal-open]"))) return;
      e.preventDefault();
      openPalette();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, settings.quickRestart]);

  useEffect(() => {
    if (paletteOpen) setLoaded(true);
  }, [paletteOpen]);

  return loaded ? <CommandPalette /> : null;
}
