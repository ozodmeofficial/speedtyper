import { ImageResponse } from "next/og";

export const alt = "SpeedTyper — typing speed test";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  const words = "the quick brown fox jumps over the lazy dog".split(" ");
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#14110f", padding: "70px 80px", color: "#efe6de" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="76" height="76" viewBox="0 0 32 32">
            <rect x="1.5" y="1.5" width="29" height="29" rx="9.5" fill="#f2794b" />
            <path d="m9 10.5 6 5.5-6 5.5" fill="none" stroke="#14110f" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17.5 22h6" stroke="#14110f" strokeWidth="3.2" strokeLinecap="round" />
          </svg>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2 }}>
            <span>Speed</span>
            <span style={{ color: "#f2794b" }}>Typer</span>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px", marginTop: 90, fontSize: 52 }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: i < 4 ? "#efe6de" : "#7c7069" }}>
              {w}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 30, color: "#7c7069" }}>wpm</span>
            <span style={{ fontSize: 96, color: "#f2794b", lineHeight: 1 }}>128</span>
          </div>
          <span style={{ fontSize: 34, color: "#7c7069" }}>speedtyper.uz</span>
        </div>
      </div>
    ),
    size,
  );
}
