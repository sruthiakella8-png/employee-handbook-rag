import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import { InfoIcon } from "@/components/ChatIcons";
import { XIcon } from "@/components/AdminIcons";
import { authFetch } from "@/lib/auth";

type Section = { section_title: string; text: string; from_active: boolean; document: string };
type State = { status: "loading" } | { status: "ready"; section: Section } | { status: "error"; message: string };

/** A section's text often starts with its own heading; the panel already shows the title. */
function withoutHeading(text: string) {
  return text.replace(/^\s*#{1,6}\s.*\n+/, "").trim();
}

/** Slide-over that shows the handbook text behind a source chip. Esc or a click outside closes it. */
export default function SourcePanel({ title, onClose }: { title: string; onClose: () => void }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      try {
        const res = await authFetch(`/api/sections/?title=${encodeURIComponent(title)}`);
        if (res.status === 404) throw new Error("This section is no longer in the handbook.");
        if (!res.ok) throw new Error("Couldn't load this section. Please try again.");
        const section: Section = await res.json();
        if (!cancelled) setState({ status: "ready", section });
      } catch (err) {
        const message =
          err instanceof TypeError
            ? "Couldn't reach the server."
            : err instanceof Error
              ? err.message
              : "Couldn't load this section.";
        if (!cancelled) setState({ status: "error", message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [title]);

  // Move focus into the panel, and give it back to the chip that opened it.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      e.preventDefault(); // the close button is the only control, so keep focus on it
      closeRef.current?.focus();
    }
  }

  const match = title.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full animate-rise flex-col bg-background shadow-2xl sm:max-w-md sm:border-l"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">From the handbook</p>
            <h2 id={titleId} className="mt-0.5 font-display text-lg font-semibold tracking-tight">
              {match ? (
                <>
                  <span className="mr-2 tabular-nums text-primary">§{match[1]}</span>
                  {match[2]}
                </>
              ) : (
                title
              )}
            </h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 rounded-lg p-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {state.status === "loading" && (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading section">
              {["w-11/12", "w-full", "w-4/5", "w-2/3"].map((w) => (
                <div key={w} className={`h-3 animate-pulse rounded bg-muted ${w}`} />
              ))}
            </div>
          )}

          {state.status === "error" && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {state.message}
            </p>
          )}

          {state.status === "ready" && (
            <>
              {!state.section.from_active && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-dashed border-primary/30 bg-accent/40 px-3 py-2.5 text-xs text-muted-foreground">
                  <InfoIcon size={14} className="mt-0.5 shrink-0 text-primary" />
                  <p>
                    This is from an earlier version of the handbook ({state.section.document}). The current
                    handbook may word it differently.
                  </p>
                </div>
              )}
              <div className="text-[0.9375rem] leading-relaxed [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
                <ReactMarkdown>{withoutHeading(state.section.text)}</ReactMarkdown>
              </div>
            </>
          )}
        </div>

        {state.status === "ready" && (
          <footer className="border-t px-5 py-3 text-xs text-muted-foreground">
            Source: {state.section.document}
          </footer>
        )}
      </aside>
    </div>
  );
}
