import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import UsersPanel from "@/components/UsersPanel";
import type { AppUser } from "@/components/UsersPanel";
import StatusPill from "@/components/StatusPill";
import ConfirmDialog from "@/components/ConfirmDialog";
import { CheckIcon, LogOutIcon } from "@/components/ChatIcons";
import {
  AlertIcon,
  ChevronIcon,
  ClockIcon,
  FileIcon,
  SpinnerIcon,
  UploadIcon,
  UsersIcon,
} from "@/components/AdminIcons";
import { authFetch, getSession, logout } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/time";

type Doc = {
  id: number;
  file_name: string;
  status: "processing" | "active" | "replaced" | "failed";
  chunk_count: number;
  uploaded_at: string;
};

type Notice = { kind: "success" | "error" | "info"; text: string } | null;
type Tab = "handbook" | "people";

const ALLOWED_EXTENSIONS = [".pdf",".docx",".md", ".txt"];

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-background p-3 shadow-sm shadow-primary/5 sm:p-4">
      <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground sm:flex">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold" title={value}>
          {value}
        </p>
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function NoticeCard({ notice }: { notice: NonNullable<Notice> }) {
  const tone =
    notice.kind === "success"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : notice.kind === "error"
        ? "border-destructive/30 bg-destructive/5"
        : "bg-background";
  const icon =
    notice.kind === "success" ? (
      <CheckIcon size={18} className="text-emerald-600" />
    ) : notice.kind === "error" ? (
      <AlertIcon size={18} className="text-destructive" />
    ) : (
      <SpinnerIcon size={18} className="text-primary" />
    );
  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={`flex animate-rise items-start gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <p>{notice.text}</p>
    </div>
  );
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>("handbook");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showPrevious, setShowPrevious] = useState(false);
  const session = getSession();
  const navigate = useNavigate();

  const loadDocuments = useCallback(async () => {
    try {
      const res = await authFetch("/api/documents/");
      if (!res.ok) throw new Error("Request failed");
      setDocs(await res.json());
      setListError(false);
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // setUsers never changes, so UsersPanel's loader stays stable and doesn't refetch in a loop.
  const handleUsersLoaded = useCallback((list: AppUser[]) => {
    setUsers(list);
    setUsersLoaded(true);
  }, []);

  const activeDoc = docs.find((d) => d.status === "active");
  const processingDoc = docs.find((d) => d.status === "processing");
  const previousDocs = docs.filter((d) => d.status !== "active" && d.status !== "processing");

  async function uploadFile(file: File) {
    setUploading(true);
    setNotice({ kind: "info", text: `Uploading and processing ${file.name}…` });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await authFetch("/api/documents/upload/", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
if (res.status === 413) throw new Error("That file is too large (limit 10 MB).");
if (!res.ok) throw new Error(data.detail ?? data.error ?? "Upload failed.");
      setNotice({
        kind: "success",
        text: `Processed ${data.chunks} chunks from ${data.file_name}. It is now the active handbook.`,
      });
      await loadDocuments();
    } catch (err) {
      const text =
        err instanceof TypeError
          ? "Couldn't reach the server. Make sure Django and the RAG service are running."
          : err instanceof Error
            ? err.message
            : "Upload failed.";
      setNotice({ kind: "error", text });
    } finally {
      setUploading(false);
    }
  }

  // Replacing the active handbook changes every answer, so ask first.
  function chooseFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      setNotice({ kind: "error", text: "Please choose a PDF, Word, Markdown (.md) or plain text (.txt) file." });
      return;
    }
    if (activeDoc) setPendingFile(file);
    else uploadFile(file);
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) chooseFile(file);
    e.target.value = ""; // lets you pick the same file again later
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !uploading) chooseFile(file);
  }

  function handleTabKeys(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next: Tab = tab === "handbook" ? "people" : "handbook";
      setTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    }
  }

  const activeUsers = users.filter((u) => u.is_active).length;
  const adminCount = users.filter((u) => u.is_admin).length;
  const latestUpload = docs[0]?.uploaded_at;

  const tabs: { id: Tab; label: string; icon: ReactNode; count?: number }[] = [
    { id: "handbook", label: "Handbook", icon: <FileIcon size={16} /> },
    { id: "people", label: "People", icon: <UsersIcon size={16} />, count: usersLoaded ? users.length : undefined },
  ];

  return (
    <div className="min-h-dvh bg-muted/50">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-3 md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <LogoMark size={30} />
          <span className="truncate font-display text-[0.95rem] font-semibold tracking-tight">
            Nimbus HR Assistant
          </span>
          <span className="hidden text-sm text-muted-foreground sm:inline">/ Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/chat" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Back to chat
          </Link>
          <div
            className="hidden size-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white sm:flex"
            title={session?.email}
            aria-hidden="true"
          >
            {session?.email?.slice(0, 2).toUpperCase()}
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/");
            }}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-md p-1.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOutIcon size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage the handbook the assistant answers from, and who can use it.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            icon={<FileIcon size={20} />}
            label="Active handbook"
            value={activeDoc ? activeDoc.file_name : listLoading ? "Loading…" : "None yet"}
            detail={activeDoc ? `${activeDoc.chunk_count} chunks` : undefined}
          />
          <SummaryCard
            icon={<UsersIcon size={20} />}
            label="Active accounts"
            value={usersLoaded ? String(activeUsers) : "—"}
            detail={usersLoaded ? `${users.length} total, ${adminCount} admin${adminCount === 1 ? "" : "s"}` : undefined}
          />
          <SummaryCard
            icon={<ClockIcon size={20} />}
            label="Last upload"
            value={latestUpload ? relativeTime(latestUpload) : listLoading ? "Loading…" : "No uploads yet"}
            detail={latestUpload ? formatDate(latestUpload) : undefined}
          />
        </div>

        <div
          role="tablist"
          aria-label="Admin sections"
          onKeyDown={handleTabKeys}
          className="flex w-fit gap-1 rounded-xl border bg-background p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
              {t.count !== undefined && <span className="text-xs tabular-nums opacity-80">{t.count}</span>}
            </button>
          ))}
        </div>

        {/* Both panels stay mounted so the People count above is always up to date. */}
        <div id="panel-handbook" role="tabpanel" aria-labelledby="tab-handbook" hidden={tab !== "handbook"} className="flex flex-col gap-5">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Handbook documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The assistant answers only from the active handbook. A new upload replaces it.
            </p>
          </div>

          {listError && (
            <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Couldn't load documents. Is the Django server running?
            </p>
          )}

          {activeDoc ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-background p-5 shadow-sm shadow-primary/5">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
                <FileIcon size={24} />
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{activeDoc.file_name}</p>
                  <StatusPill status="active" />
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {activeDoc.chunk_count} chunks · uploaded{" "}
                  <span title={formatDate(activeDoc.uploaded_at)}>{relativeTime(activeDoc.uploaded_at)}</span>
                </p>
              </div>
            </div>
          ) : (
            !listLoading &&
            !listError && (
              <div className="rounded-xl border border-dashed bg-background px-5 py-6 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No active handbook yet</p>
                <p className="mt-1">Upload one below so employees can start asking questions.</p>
              </div>
            )
          )}

          {processingDoc && (
            <div className="flex items-center gap-3 rounded-xl border bg-background px-4 py-3 text-sm">
              <SpinnerIcon size={16} className="text-primary" />
              <span>
                <strong className="font-medium">{processingDoc.file_name}</strong> is still being processed.
              </span>
            </div>
          )}

          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed bg-background px-6 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/60 hover:bg-accent/40 ${
              dragging ? "border-primary bg-accent" : "border-border"
            } ${uploading ? "pointer-events-none opacity-70" : ""}`}
          >
            <input
              type="file"
              accept=".pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploading}
            />
            {uploading ? (
              <SpinnerIcon size={26} className="text-primary" />
            ) : (
              <UploadIcon size={26} className="text-primary" />
            )}
            <span className="text-sm font-medium">
              {uploading
                ? "Processing the handbook…"
                : activeDoc
                  ? "Replace the handbook: drag a file here, or click to browse"
                  : "Drag and drop a handbook file here, or click to browse"}
            </span>
            <span className="text-xs text-muted-foreground">PDF, Word (.docx), Markdown or text · up to 10 MB</span>
          </label>

          {notice && <NoticeCard notice={notice} />}

          {previousDocs.length > 0 && (
            <div className="rounded-xl border bg-background shadow-sm shadow-primary/5">
              <button
                onClick={() => setShowPrevious((v) => !v)}
                aria-expanded={showPrevious}
                aria-controls="previous-versions"
                className="flex w-full items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span>
                  Previous versions <span className="text-muted-foreground tabular-nums">({previousDocs.length})</span>
                </span>
                <ChevronIcon size={16} className={`transition-transform ${showPrevious ? "rotate-180" : ""}`} />
              </button>
              {showPrevious && (
                <ul id="previous-versions" className="divide-y border-t">
                  {previousDocs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 basis-40 truncate font-medium">{d.file_name}</span>
                      <StatusPill status={d.status} />
                      <span className="text-xs text-muted-foreground tabular-nums">{d.chunk_count} chunks</span>
                      <span className="text-xs text-muted-foreground" title={formatDate(d.uploaded_at)}>
                        {relativeTime(d.uploaded_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div id="panel-people" role="tabpanel" aria-labelledby="tab-people" hidden={tab !== "people"}>
          <UsersPanel onLoaded={handleUsersLoaded} />
        </div>
      </main>

      {pendingFile && activeDoc && (
        <ConfirmDialog
          title="Replace the active handbook?"
          confirmLabel="Replace and process"
          onCancel={() => setPendingFile(null)}
          onConfirm={() => {
            const file = pendingFile;
            setPendingFile(null);
            uploadFile(file);
          }}
        >
          <p>
            <strong className="font-medium text-foreground">{pendingFile.name}</strong> will replace{" "}
            <strong className="font-medium text-foreground">{activeDoc.file_name}</strong>. Employees will get answers
            from the new file as soon as it has been processed.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
