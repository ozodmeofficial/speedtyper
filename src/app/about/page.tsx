import type { Metadata } from "next";
import { getRequestContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestContext();
  return { title: t("about.title"), description: t("about.p1"), alternates: { canonical: "/about" } };
}

export default async function AboutPage() {
  const { t } = await getRequestContext();
  const shortcuts: [string[], string][] = [
    [["tab"], t("test.hintRestart")],
    [["esc"], t("test.hintPalette")],
    [["ctrl", "shift", "p"], t("test.hintPalette")],
    [["shift", "enter"], t("test.hintZen")],
    [["ctrl", "backspace"], "⌫ word"],
  ];
  const Block = ({ title, text }: { title: string; text: string }) => (
    <section className="mt-10">
      <h2 className="mb-2 text-xl text-sub">{title}</h2>
      <p className="leading-relaxed text-text">{text}</p>
    </section>
  );
  return (
    <article className="mx-auto w-full max-w-3xl py-10">
      <h1 className="text-4xl text-text">{t("about.title")}</h1>
      <p className="mt-6 text-lg leading-relaxed text-text">{t("about.p1")}</p>
      <p className="mt-4 leading-relaxed text-sub">{t("about.p2")}</p>
      <Block title={t("about.statsTitle")} text={t("about.stats")} />
      <Block title={t("about.raceTitle")} text={t("about.race")} />
      <Block title={t("about.fairTitle")} text={t("about.fair")} />
      <section className="mt-10">
        <h2 className="mb-3 text-xl text-sub">{t("about.shortcutsTitle")}</h2>
        <ul className="space-y-2">
          {shortcuts.map(([keys, label], i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <span className="flex min-w-40 items-center gap-1">
                {keys.map((k, j) => (
                  <span key={k} className="flex items-center gap-1">
                    {j > 0 ? <span className="text-sub">+</span> : null}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </span>
              <span className="text-sub">{label}</span>
            </li>
          ))}
        </ul>
      </section>
      <p className="mt-12 text-sm text-sub">{t("about.contact")}</p>
    </article>
  );
}
