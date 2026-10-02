import type { Metadata, Viewport } from "next";
import "./globals.css";
import { fontVariables } from "./fonts";
import { getRequestContext } from "@/server/context";
import { prisma } from "@/server/db";
import { getProgress } from "@/server/xp";
import type { UserProgress } from "@/lib/xp";
import { activeColors, colorSchemeOf, fontVar, SETTINGS_VERSION } from "@/lib/settings";
import { DEFAULT_THEME, THEMES, themeStyle, COLOR_KEYS, THEME_VARS } from "@/lib/themes";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { AppProvider } from "@/components/providers/AppProvider";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PaletteHost } from "@/components/layout/PaletteHost";
import { Backdrop } from "@/components/layout/Backdrop";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const { t, lang } = await getRequestContext();
  return {
    metadataBase: new URL(APP_URL),
    title: { default: t("meta.title"), template: "%s · SpeedTyper" },
    description: t("meta.description"),
    applicationName: "SpeedTyper",
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: "SpeedTyper",
      title: t("meta.title"),
      description: t("meta.description"),
      url: APP_URL,
      locale: lang === "uz" ? "uz_UZ" : lang === "ru" ? "ru_RU" : "en_US",
    },
    twitter: { card: "summary_large_image", title: t("meta.title"), description: t("meta.description") },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#14110f",
  colorScheme: "dark light",
};

/** Applies the locally saved theme/font before first paint (no flash). */
function themeScript(): string {
  const table: Record<string, string[]> = {};
  const light: string[] = [];
  for (const th of THEMES) {
    table[th.id] = COLOR_KEYS.map((k) => th[k]);
    if (th.light) light.push(th.id);
  }
  const vars = COLOR_KEYS.map((k) => THEME_VARS[k]);
  return `(function(){try{var r=localStorage.getItem("st_settings");if(!r)return;var o=JSON.parse(r),d=document.documentElement,T=${JSON.stringify(
    table,
  )},V=${JSON.stringify(vars)},K=${JSON.stringify(COLOR_KEYS)},L=${JSON.stringify(light)},c=null,th=o.v!==${SETTINGS_VERSION}&&(!o.theme||o.theme==="graphite"||(o.v===2&&o.theme==="claude"))?"${DEFAULT_THEME}":o.theme;if(o.useCustomTheme&&o.customTheme){c=K.map(function(k){return o.customTheme[k]})}else if(T[th]){c=T[th];d.style.colorScheme=L.indexOf(th)>=0?"light":"dark"}if(c)for(var i=0;i<V.length;i++){if(/^#[0-9a-f]{6}$/i.test(c[i]))d.style.setProperty(V[i],c[i])}if(typeof o.fontFamily==="string"&&/^[a-z_]+$/.test(o.fontFamily))d.style.setProperty("--typing-font","var(--font-"+o.fontFamily.replace(/_/g,"-")+")");if(typeof o.fontSize==="number")d.style.setProperty("--font-size",o.fontSize+"rem")}catch(e){}})();`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, dict, settings, user, nonce, t } = await getRequestContext();
  const colors = activeColors(settings);
  const style = {
    ...themeStyle(colors),
    "--typing-font": fontVar(settings.fontFamily),
    "--font-size": `${settings.fontSize}rem`,
    colorScheme: colorSchemeOf(settings),
  } as React.CSSProperties;

  let serverSettings: { settings: unknown; at: number } | null = null;
  let progress: UserProgress | null = null;
  if (user) {
    const [row, p] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { settings: true, settingsAt: true } }),
      getProgress(user.id).catch(() => null),
    ]);
    if (row?.settings && row.settingsAt) serverSettings = { settings: row.settings, at: row.settingsAt.getTime() };
    progress = p;
  }

  return (
    <html lang={lang} className={fontVariables} style={style} suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body>
        <Backdrop />
        <a href="#main" className="skip-link">
          {t("nav.skip")}
        </a>
        <I18nProvider lang={lang} dict={dict}>
          <AppProvider
            user={user ? { id: user.id, username: user.username } : null}
            initialProgress={progress}
            initialSettings={settings}
            serverSettings={serverSettings}
          >
            <div className="flex min-h-dvh flex-col">
              <Header />
              <main id="main" className="page flex flex-1 flex-col">
                {children}
              </main>
              <Footer />
            </div>
            <PaletteHost />
          </AppProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
