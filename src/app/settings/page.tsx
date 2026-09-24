import type { Metadata } from "next";
import { getRequestContext } from "@/server/context";
import { SettingsPanel } from "@/components/settings/SettingsPanel";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("settings.title"), alternates: { canonical: "/settings" } };
}

export default function SettingsPage() {
  return <SettingsPanel />;
}
