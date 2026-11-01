const styles = {
  active: { dot: "bg-emerald-500", text: "text-emerald-800 dark:text-emerald-300", bg: "bg-emerald-500/10", label: "Active" },
  processing: { dot: "bg-amber-500 animate-pulse", text: "text-amber-800 dark:text-amber-300", bg: "bg-amber-500/10", label: "Processing" },
  replaced: { dot: "bg-muted-foreground/60", text: "text-muted-foreground", bg: "bg-muted", label: "Replaced" },
  failed: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10", label: "Failed" },
  deactivated: { dot: "bg-destructive", text: "text-destructive", bg: "bg-destructive/10", label: "Deactivated" },
} as const;

export type PillStatus = keyof typeof styles;

/** A small coloured pill with a status dot. Colour is never the only signal: the label is always shown. */
export default function StatusPill({ status, label }: { status: PillStatus; label?: string }) {
  const s = styles[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {label ?? s.label}
    </span>
  );
}
