import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { authFetch } from "@/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";


type Doc = {
  id: number;
  file_name: string;
  status: "processing" | "active" | "replaced" | "failed";
  chunk_count: number;
  uploaded_at: string;
};

type Notice = { kind: "success" | "error" | "info"; text: string } | null;

const statusBadge: Record<Doc["status"], "default" | "secondary" | "outline" | "destructive"> = {
  active: "default",
  replaced: "secondary",
  processing: "outline",
  failed: "destructive",
};

const noticeClass = {
  success: "text-foreground",
  error: "text-destructive",
  info: "text-muted-foreground",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default function Admin() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const loadDocuments = useCallback(async () => {
    try {
        const res = await authFetch("/api/documents/");      if (!res.ok) throw new Error("Request failed");
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

  async function uploadFile(file: File) {
    setUploading(true);
    setNotice({ kind: "info", text: `Uploading and processing ${file.name}…` });
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await authFetch("/api/documents/upload/", { method: "POST", body });      const data = await res.json();
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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ""; // lets you pick the same file again later
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !uploading) uploadFile(file);
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="flex items-center justify-between border-b bg-background px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            N
          </div>
          <span className="text-sm font-semibold">Nimbus HR Assistant</span>
          <span className="text-sm text-muted-foreground">/ Documents</span>
        </div>
        <Link to="/chat" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Back to chat
        </Link>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-xl font-semibold">Document management</h1>
          <p className="text-sm text-muted-foreground">
            Upload the handbook the assistant answers from. A new upload replaces the active one.
          </p>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed bg-background px-6 py-10 text-center transition-colors focus-within:ring-2 focus-within:ring-ring ${
            dragging ? "border-primary bg-muted" : "border-border"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            type="file"
            accept=".md,.txt,text/markdown,text/plain"
            className="sr-only"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <span className="text-sm font-medium">
            Drag and drop a handbook file here, or click to browse
          </span>
          <span className="text-xs text-muted-foreground">
            Markdown (.md) or plain text (.txt) for now
          </span>
        </label>

        {notice && (
          <div
            role="status"
            className={`rounded-lg border bg-background px-4 py-3 text-sm ${noticeClass[notice.kind]}`}
          >
            {notice.text}
          </div>
        )}

        <div className="rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Uploaded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.file_name}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadge[d.status]} className="capitalize">
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{d.chunk_count}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(d.uploaded_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {listLoading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading documents…</p>
          )}
          {listError && (
            <p className="px-4 py-6 text-center text-sm text-destructive">
              Couldn't load documents. Is the Django server running?
            </p>
          )}
          {!listLoading && !listError && docs.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No documents uploaded yet.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}