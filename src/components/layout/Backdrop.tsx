/**
 * Decorative dusk landscape behind every page: layered ridges lit by the theme's
 * main colour. Pure SVG + CSS variables, so it follows every theme.
 */
export function Backdrop() {
  const m = (pct: number, base = "var(--bg)") => `color-mix(in srgb, var(--main) ${pct}%, ${base})`;
  const dark = (pct: number) => `color-mix(in srgb, var(--bg) ${100 - pct}%, var(--text) ${pct}%)`;
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 1600 520" preserveAspectRatio="xMidYMax slice">
        <defs>
          <radialGradient id="bd-glow" cx="50%" cy="100%" r="70%">
            <stop offset="0%" stopColor="var(--main)" stopOpacity="0.22" />
            <stop offset="45%" stopColor="var(--main)" stopOpacity="0.05" />
            <stop offset="100%" stopColor="var(--main)" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="bd-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--main)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--main)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width="1600" height="520" fill="url(#bd-glow)" />
        {/* far ridge */}
        <path
          d="M0 300 L90 250 L170 270 L260 200 L340 235 L420 170 L500 220 L560 205 L640 260 L760 290 L900 300 L1000 270 L1080 215 L1160 240 L1240 175 L1320 220 L1400 190 L1480 240 L1600 210 V520 H0Z"
          fill={m(7)}
          opacity="0.9"
        />
        <path
          d="M0 300 L90 250 L170 270 L260 200 L340 235 L420 170 L500 220 L560 205 L640 260 L760 290 L900 300 L1000 270 L1080 215 L1160 240 L1240 175 L1320 220 L1400 190 L1480 240 L1600 210"
          fill="none"
          stroke="url(#bd-rim)"
          strokeWidth="1.2"
          opacity="0.45"
        />
        {/* middle ridge */}
        <path
          d="M0 360 L120 320 L200 345 L300 290 L380 330 L470 300 L560 355 L700 395 L820 400 L940 390 L1040 350 L1120 300 L1200 330 L1300 285 L1380 320 L1480 300 L1600 330 V520 H0Z"
          fill={m(3)}
        />
        <path
          d="M0 360 L120 320 L200 345 L300 290 L380 330 L470 300 L560 355 L700 395 L820 400 L940 390 L1040 350 L1120 300 L1200 330 L1300 285 L1380 320 L1480 300 L1600 330"
          fill="none"
          stroke="var(--main)"
          strokeWidth="1"
          opacity="0.2"
        />
        {/* glowing valley */}
        <ellipse cx="800" cy="470" rx="520" ry="70" fill="var(--main)" opacity="0.07" />
        <path d="M600 520 C 700 450, 770 475, 800 440 C 830 475, 910 450, 1000 520Z" fill="var(--main)" opacity="0.08" />
        {/* near ridge */}
        <path d="M0 430 L140 395 L260 420 L380 380 L520 440 L640 470 L760 480 L860 476 L980 460 L1100 410 L1220 440 L1340 395 L1460 425 L1600 400 V520 H0Z" fill={dark(2)} />
      </svg>
    </div>
  );
}
