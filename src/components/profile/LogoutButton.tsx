"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { LogoutIcon } from "@/components/ui/icons";
import { useT } from "@/components/providers/I18nProvider";

export function LogoutButton() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api("/api/auth/logout", { method: "POST", body: {} });
        window.location.assign("/");
      }}
    >
      <LogoutIcon size={16} /> {t("nav.logout")}
    </button>
  );
}
