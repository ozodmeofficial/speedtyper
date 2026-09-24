import type { Metadata } from "next";
import { getRequestContext } from "@/server/context";
import { RaceApp } from "@/components/race/RaceApp";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("race.title"), description: t("race.subtitle"), alternates: { canonical: "/race" } };
}

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function RacePage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const raw = typeof sp.room === "string" ? sp.room.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "";
  return <RaceApp initialCode={raw || null} />;
}
