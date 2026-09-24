import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpeedTyper",
    short_name: "SpeedTyper",
    description: "Typing speed test and live typing races",
    start_url: "/",
    display: "standalone",
    background_color: "#323437",
    theme_color: "#323437",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
