import {
  Inter,
  Roboto_Mono,
  JetBrains_Mono,
  Fira_Code,
  Source_Code_Pro,
  IBM_Plex_Mono,
  Ubuntu_Mono,
  Lexend_Deca,
  Nunito,
  Montserrat,
  Source_Serif_4,
} from "next/font/google";

// All fonts are downloaded at build time and self-hosted by next/font.
export const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-inter", display: "swap" });
export const robotoMono = Roboto_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-roboto-mono", display: "swap" });
export const jetbrainsMono = JetBrains_Mono({ subsets: ["latin", "cyrillic"], variable: "--font-jetbrains-mono", display: "swap", preload: false });
export const firaCode = Fira_Code({ subsets: ["latin", "cyrillic"], variable: "--font-fira-code", display: "swap", preload: false });
export const sourceCodePro = Source_Code_Pro({ subsets: ["latin", "cyrillic"], variable: "--font-source-code-pro", display: "swap", preload: false });
export const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-ibm-plex-mono", display: "swap", preload: false });
export const ubuntuMono = Ubuntu_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "700"], variable: "--font-ubuntu-mono", display: "swap", preload: false });
export const lexendDeca = Lexend_Deca({ subsets: ["latin"], variable: "--font-lexend-deca", display: "swap", preload: false });
export const nunito = Nunito({ subsets: ["latin", "cyrillic"], variable: "--font-nunito", display: "swap", preload: false });
export const montserrat = Montserrat({ subsets: ["latin", "cyrillic"], variable: "--font-montserrat", display: "swap", preload: false });

export const sourceSerif = Source_Serif_4({ subsets: ["latin", "cyrillic"], variable: "--font-source-serif", display: "swap" });

export const fontVariables = [
  sourceSerif,
  inter,
  robotoMono,
  jetbrainsMono,
  firaCode,
  sourceCodePro,
  ibmPlexMono,
  ubuntuMono,
  lexendDeca,
  nunito,
  montserrat,
]
  .map((f) => f.variable)
  .join(" ");
