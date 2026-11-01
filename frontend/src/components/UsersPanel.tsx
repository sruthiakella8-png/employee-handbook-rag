import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckIcon, CopyIcon, PlusIcon } from "@/components/ChatIcons";
import { MailIcon, SearchIcon, UploadIcon, XIcon } from "@/components/AdminIcons";
import ImportUsers from "@/components/ImportUsers";
import StatusPill from "@/components/StatusPill";
import { authFetch } from "@/lib/auth";
import { formatDate, relativeTime } from "@/lib/time";

export type AppUser = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  last_login: string | null;
};

type Filter = "all" | "employees" | "admins" | "deactivated";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function errorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

/** "Signed in 3 days ago", or "Signed in on 22 Sept 2026" once it is more than a month back. */
function signedIn(iso: string) {
  const text = relativeTime(iso);
  return /\d{4}/.test(text) ? `Signed in on ${text}` : `Signed in ${text}`;
}

function initials(user: AppUser) {
  return (user.name || user.email).slice(0, 2).toUpperCase();
}

function UserRow({
  user,
  confirming,
  sending,
  onAskDeactivate,
  onCancel,
  onSetActive,
  onSendReset,
}: {
  user: AppUser;
  confirming: boolean;
  sending: boolean;
  onAskDeactivate: () => void;
  onCancel: () => void;
  onSetActive: (isActive: boolean) => void;
  onSendReset: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-muted/40 md:flex-nowrap">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            user.is_active ? "bg-brand text-white" : "bg-muted text-muted-foreground"
          }`}
          aria-hidden="true"
        >
          {initials(user)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.email}</p>
          <p className="truncate text-xs text-muted-foreground">{user.name || "No name added"}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
            user.is_admin ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {user.is_admin ? "Admin" : "Employee"}
        </span>
        <StatusPill status={user.is_active ? "active" : "deactivated"} />
      </div>

      <p
        className="text-xs text-muted-foreground md:w-36"
        title={user.last_login ? formatDate(user.last_login) : undefined}
      >
        {user.last_login ? signedIn(user.last_login) : "Never signed in"}
      </p>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-1 md:ml-0 md:min-w-[17rem]">
        {user.is_admin ? null : confirming ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="destructive"
              onClick={() => onSetActive(false)}
              aria-label={`Confirm deactivating ${user.email}`}
            >
              Deactivate
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        ) : user.is_active ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={onSendReset}
              disabled={sending}
              aria-label={`Send a password reset link to ${user.email}`}
            >
              <MailIcon size={14} />
              {sending ? "Sending…" : "Send reset link"}
            </Button>
            <Button size="sm" variant="ghost" onClick={onAskDeactivate} aria-label={`Deactivate ${user.email}`}>
              Deactivate
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onSetActive(true)} aria-label={`Reactivate ${user.email}`}>
            Reactivate
          </Button>
        )}
      </div>
    </li>
  );
}

export default function UsersPanel({ onLoaded }: { onLoaded?: (users: AppUser[]) => void }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const [importing, setImporting] = useState(false);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [actionNotice, setActionNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await authFetch("/api/users/");
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't load users."));
      const data: AppUser[] = await res.json();
      setUsers(data);
      setLoadError("");
      onLoaded?.(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load users.");
    } finally {
      setLoaded(true);
    }
  }, [onLoaded]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setCreated(null);
    setCopied(false);
    setCreating(true);
    try {
      const res = await authFetch("/api/users/", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, name }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't create the account."));
      const data = await res.json();
      setCreated({ email: data.user.email, password: data.temporary_password });
      setEmail("");
      setName("");
      setAdding(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create the account.");
    } finally {
      setCreating(false);
    }
  }

  async function setActive(user: AppUser, isActive: boolean) {
    setConfirmId(null);
    try {
      const res = await authFetch(`/api/users/${user.id}/`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ is_active: isActive }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't update the account."));
      load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't update the account.");
    }
  }

  async function sendReset(user: AppUser) {
    setSendingId(user.id);
    setActionNotice(null);
    try {
      const res = await authFetch(`/api/users/${user.id}/send-reset/`, { method: "POST" });
      if (!res.ok) throw new Error(await errorMessage(res, "Couldn't send the reset link."));
      setActionNotice({ kind: "success", text: `Reset link sent to ${user.email}. It works once and expires in 1 hour.` });
    } catch (err) {
      setActionNotice({
        kind: "error",
        text: err instanceof TypeError ? "Couldn't reach the server." : err instanceof Error ? err.message : "Couldn't send the reset link.",
      });
    } finally {
      setSendingId(null);
    }
  }

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      /* clipboard can be blocked; the password is still visible on screen */
    }
  }

  const counts = useMemo(
    () => ({
      all: users.length,
      employees: users.filter((u) => !u.is_admin).length,
      admins: users.filter((u) => u.is_admin).length,
      deactivated: users.filter((u) => !u.is_active).length,
    }),
    [users],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter === "employees" && u.is_admin) return false;
      if (filter === "admins" && !u.is_admin) return false;
      if (filter === "deactivated" && u.is_active) return false;
      return !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q);
    });
  }, [users, query, filter]);

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "employees", label: "Employees" },
    { id: "admins", label: "Admins" },
    { id: "deactivated", label: "Deactivated" },
  ];

  return (
    <section aria-labelledby="people-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="people-heading" className="font-display text-2xl font-semibold tracking-tight">
            Employee accounts
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts are created by HR admins. New employees get a temporary password to share with them.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setImporting((v) => !v)}
            aria-expanded={importing}
            aria-controls="import-employees"
          >
            <UploadIcon size={16} />
            Import CSV
          </Button>
          <Button onClick={() => setAdding((v) => !v)} aria-expanded={adding} aria-controls="add-employee-form">
            <PlusIcon size={16} />
            Add employee
          </Button>
        </div>
      </div>

      {importing && (
        <div id="import-employees">
          <ImportUsers onImported={load} onClose={() => setImporting(false)} />
        </div>
      )}

      {actionNotice && (
        <div
          role={actionNotice.kind === "error" ? "alert" : "status"}
          className={`flex animate-rise items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            actionNotice.kind === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/30 bg-destructive/5 text-destructive"
          }`}
        >
          <p>{actionNotice.text}</p>
          <button
            onClick={() => setActionNotice(null)}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon size={16} />
          </button>
        </div>
      )}

      {adding && (
        <form
          id="add-employee-form"
          onSubmit={handleCreate}
          className="flex animate-rise flex-col gap-4 rounded-xl border bg-background p-4 shadow-sm shadow-primary/5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-email">Work email</Label>
              <Input
                id="new-email"
                type="email"
                placeholder="name@nimbustech.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-name">Name (optional)</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setFormError("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create account"}
            </Button>
          </div>
        </form>
      )}

      {created && (
        <div role="status" className="animate-rise rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p>
              Account created for <strong>{created.email}</strong>. Share this temporary password with them now.{" "}
              <span className="font-medium">It is shown only once.</span>
            </p>
            <button
              onClick={() => setCreated(null)}
              aria-label="Dismiss"
              className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="rounded-md border bg-background px-3 py-1.5 font-mono text-sm">{created.password}</code>
            <Button type="button" variant="outline" size="sm" onClick={copyPassword}>
              {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-background shadow-sm shadow-primary/5">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative min-w-[14rem] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <SearchIcon size={16} />
            </span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or email"
              aria-label="Search employees"
              className="pl-9"
            />
          </div>
          <div role="group" aria-label="Filter accounts" className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={`rounded-full px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                  filter === f.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {f.label} <span className="tabular-nums opacity-80">{counts[f.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {loadError && (
          <p role="alert" className="border-b px-4 py-3 text-sm text-destructive">
            {loadError}
          </p>
        )}

        {!loaded ? (
          <div className="flex flex-col gap-3 p-4" role="status" aria-label="Loading accounts">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="size-9 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/5 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {users.length === 0
              ? "No accounts yet. Add the first employee to get started."
              : "No accounts match your search."}
          </p>
        ) : (
          <ul className="divide-y">
            {visible.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                confirming={confirmId === u.id}
                sending={sendingId === u.id}
                onAskDeactivate={() => setConfirmId(u.id)}
                onCancel={() => setConfirmId(null)}
                onSetActive={(isActive) => setActive(u, isActive)}
                onSendReset={() => sendReset(u)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
