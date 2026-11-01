import { useId } from "react";

/**
 * Nimbus mark: a cloud (nimbus) shaped as a speech bubble, with a small spark for the assistant.
 * Drawn as SVG so it stays sharp at any size and takes its colours from the theme.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  const gradient = "nimbus" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Nimbus HR Assistant"
      className={className}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-from)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-to)" }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <g fill="#fff">
        <circle cx="12" cy="17.5" r="4.4" />
        <circle cx="17.2" cy="14.8" r="5.4" />
        <circle cx="22" cy="18.2" r="3.9" />
        <rect x="12" y="17.6" width="10" height="4.5" rx="2.2" />
        <path d="M11.2 21.4 9.6 26l5.4-4z" />
      </g>
      <path
        d="M24.6 5.6l.85 2.05 2.05.85-2.05.85-.85 2.05-.85-2.05-2.05-.85 2.05-.85z"
        fill="#fff"
        opacity="0.95"
      />
    </svg>
  );
}

export default function Logo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className="font-display text-base font-semibold tracking-tight">Nimbus HR Assistant</span>
    </span>
  );
}
