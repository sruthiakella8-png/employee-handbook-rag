import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { CheckIcon, CopyIcon } from "@/components/ChatIcons";
import { DownloadIcon, SpinnerIcon, UploadIcon, XIcon } from "@/components/AdminIcons";
import { authFetch } from "@/lib/auth";

type Created = { email: string; name: string; temporary_password: string };
type Skipped = { row: number; email: string; reason: string };
type Result = { created: Created[]; skipped: Skipped[] };

/** Quote a CSV cell, and defuse text a spreadsheet would run as a formula (=, +, -, @). Not for passwords. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function credentialsCsv(rows: Created[]) {
  // Temporary passwords never start with "-" (the server makes sure), so Excel won't read them as formulas.
  const lines = rows.map((r) => [csvCell(r.email), csvCell(r.name), r.temporary_password].join(","));
  return ["email,name,temporary_password", ...lines].join("\n") + "\n";
}

export default function ImportUsers({ onImported, onClose }: { onImported: () => void; onClose: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets you pick the same file again
    if (!file) return;
    setError("");
    setResult(null);
    setCopied(false);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await authFetch("/api/users/import/", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail ?? "Import failed.");
      setResult(data);
      if (data.created?.length) onImported();
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Make sure Django is running."
          : err instanceof Error
            ? err.message
            : "Import failed.",
      );
    } finally {
      setUploading(false);
    }
  }

  function download() {
    if (!result) return;
    const blob = new Blob([credentialsCsv(result.created)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "new-employee-passwords.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.created.map((r) => `${r.email}\t${r.temporary_password}`).join("\n"));
      setCopied(true);
    } catch {
      /* clipboard can be blocked; the passwords are still on screen */
    }
  }

  return (
    <div className="flex animate-rise flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm shadow-primary/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Import employees from a CSV file</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Put the work email in the first column and, optionally, the name in the second. A header row is fine.
            Up to 200 rows at a time. Everyone gets their own temporary password.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close import"
          className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon size={16} />
        </button>
      </div>

      <div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFile} aria-label="Choose a CSV file" />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <SpinnerIcon size={16} /> : <UploadIcon size={16} />}
          {uploading ? "Importing…" : "Choose CSV file"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div role="status" className="flex flex-col gap-4">
          <p className="text-sm">
            <strong>{result.created.length}</strong> account{result.created.length === 1 ? "" : "s"} created
            {result.skipped.length > 0 && (
              <>
                , <strong>{result.skipped.length}</strong> skipped
              </>
            )}
            .
          </p>

          {result.created.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-sm">
                Share each temporary password with its owner. <span className="font-medium">They are shown only once,</span>{" "}
                so download them now.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={download}>
                  <DownloadIcon size={14} />
                  Download passwords (.csv)
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={copyAll}>
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  {copied ? "Copied" : "Copy all"}
                </Button>
              </div>
              <ul className="mt-3 max-h-56 divide-y overflow-y-auto rounded-md border bg-background text-sm">
                {result.created.map((r) => (
                  <li key={r.email} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                    <span className="min-w-0 truncate">{r.email}</span>
                    <code className="font-mono text-xs">{r.temporary_password}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="text-sm font-medium">Skipped</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {result.skipped.map((s) => (
                  <li key={`${s.row}-${s.email}`} className="text-muted-foreground">
                    <span className="tabular-nums">Row {s.row}</span>
                    {s.email && <span className="text-foreground"> {s.email}</span>}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
