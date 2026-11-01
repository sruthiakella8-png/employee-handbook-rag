/**
 * Sign-in backdrop: translucent handbook pages floating at different depths.
 * Nearer pages are sharper and brighter; two carry a highlighted line, like a cited section.
 * Pure SVG, decorative only, and every page holds still for visitors who prefer reduced motion.
 */

import type { CSSProperties } from "react";

type PageSpec = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  blur: number;
  opacity: number;
  cited: boolean;
  duration: number;
  delay: number;
};

// Wide screens: positions are in a 1440 x 900 canvas, kept to the edges and gaps
// so no page sits behind the headline or the sample answer.
const WIDE_PAGES: PageSpec[] = [
  { x: -50, y: 620, rotate: -14, scale: 1.15, blur: 3, opacity: 0.45, cited: false, duration: 19, delay: 0 },
  { x: 470, y: 30, rotate: 8, scale: 0.7, blur: 2.5, opacity: 0.4, cited: false, duration: 15, delay: 4 },
  { x: 1040, y: 10, rotate: -8, scale: 1, blur: 2, opacity: 0.5, cited: true, duration: 17, delay: 2 },
  { x: 1230, y: 560, rotate: 12, scale: 1.25, blur: 4, opacity: 0.45, cited: false, duration: 21, delay: 6 },
  { x: 690, y: 720, rotate: 6, scale: 0.8, blur: 1, opacity: 0.6, cited: true, duration: 16, delay: 3 },
];

// Phones and tablets: a tall 520 x 1000 canvas, with pages peeking in around the form.
const TALL_PAGES: PageSpec[] = [
  { x: 330, y: -50, rotate: 10, scale: 0.85, blur: 2, opacity: 0.5, cited: true, duration: 17, delay: 1 },
  { x: -110, y: 60, rotate: -12, scale: 0.8, blur: 3, opacity: 0.4, cited: false, duration: 20, delay: 5 },
  { x: -90, y: 520, rotate: -8, scale: 0.9, blur: 2.5, opacity: 0.45, cited: false, duration: 18, delay: 3 },
  { x: 400, y: 640, rotate: 12, scale: 0.85, blur: 3, opacity: 0.45, cited: false, duration: 22, delay: 7 },
  { x: 300, y: 880, rotate: -6, scale: 0.9, blur: 1.5, opacity: 0.55, cited: true, duration: 16, delay: 2 },
  { x: -40, y: 900, rotate: 7, scale: 0.8, blur: 3, opacity: 0.4, cited: false, duration: 19, delay: 6 },
];

const textLine = "rgba(255,255,255,0.28)";
const heading = "rgba(255,255,255,0.55)";

function Page({ spec }: { spec: PageSpec }) {
  return (
    <g transform={`translate(${spec.x} ${spec.y}) rotate(${spec.rotate}) scale(${spec.scale})`}>
      <g
        className="auth-float"
        style={
          {
            ["--dur" as string]: `${spec.duration}s`,
            ["--delay" as string]: `-${spec.delay}s`,
            opacity: spec.opacity,
            filter: spec.blur ? `blur(${spec.blur}px)` : undefined,
          } as CSSProperties
        }
      >
        <rect width="220" height="290" rx="14" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.35)" />
        <rect x="22" y="26" width="90" height="12" rx="4" fill={heading} />
        {[62, 84, 106].map((y, i) => (
          <rect key={y} x="22" y={y} width={176 - i * 18} height="7" rx="3.5" fill={textLine} />
        ))}
        <rect x="22" y="134" width="70" height="10" rx="4" fill={heading} />
        {spec.cited && <rect x="16" y="156" width="188" height="24" rx="6" fill="rgba(180,150,255,0.45)" />}
        {[160, 182, 204, 226, 248].map((y, i) => (
          <rect key={y} x="22" y={y} width={i % 2 ? 150 : 176} height="7" rx="3.5" fill={textLine} />
        ))}
      </g>
    </g>
  );
}

export default function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <svg
        className="absolute inset-0 hidden h-full w-full lg:block"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
      >
        {WIDE_PAGES.map((spec) => (
          <Page key={`${spec.x}-${spec.y}`} spec={spec} />
        ))}
      </svg>
      <svg
        className="absolute inset-0 h-full w-full lg:hidden"
        viewBox="0 0 520 1000"
        preserveAspectRatio="xMidYMin slice"
      >
        {TALL_PAGES.map((spec) => (
          <Page key={`${spec.x}-${spec.y}`} spec={spec} />
        ))}
      </svg>
    </div>
  );
}
