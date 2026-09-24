import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#323437" }}>
        <svg width="140" height="140" viewBox="0 0 32 32">
          <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#e2b714" />
          <path d="m9 10.5 6 5.5-6 5.5" fill="none" stroke="#323437" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M17.5 22h6" stroke="#323437" strokeWidth="3.2" strokeLinecap="round" />
        </svg>
      </div>
    ),
    size,
  );
}
