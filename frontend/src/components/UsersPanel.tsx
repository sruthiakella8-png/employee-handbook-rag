import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authFetch } from "@/lib/auth";

type AppUser = {
  id: number;
  email: string;
  name: string;
  is_admin: boolean;
  is_active: boolean;
  last_login: string | null;
};

const JSON_HEADERS = { "Content-Type": "application/json" };

async function errorMessage(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return body.detail ?? fallback;
  } catch {
    return fallback;
  }
}

export default function UsersPanel() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loadError, setLoadError] = useState("");
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
      setUsers(await res.json());
      setLoadError("");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load users.");
    }
  }, []);

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
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create the account.");
    } finally {
      setCreating(false);
    }
  }

  async function setActive(user: AppUser, isActive: boolean) {
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

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
    } catch {
      /* clipboard can be blocked; the password is still visible on screen */
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee accounts</CardTitle>
        <p className="text-sm text-muted-foreground">
          Accounts are created by HR admins. New employees get a temporary password to share with them.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-email">Work email</Label>
            <Input
              id="new-email"
              type="email"
              placeholder="name@nimbustech.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="new-name">Name (optional)</Label>
            <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "Creating…" : "Create account"}
          </Button>
        </form>

        {formError && <p className="text-sm text-destructive">{formError}</p>}

        {created && (
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <p>
              Account created for <strong>{created.email}</strong>. Share this temporary password with them. It is
              shown only once.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <code className="rounded bg-background px-2 py-1 font-mono">{created.password}</code>
              <Button type="button" variant="outline" size="sm" onClick={copyPassword}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}</TableCell>
                <TableCell>{u.name || "—"}</TableCell>
                <TableCell>
                  <Badge variant={u.is_admin ? "default" : "secondary"}>{u.is_admin ? "Admin" : "Employee"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.is_active ? "outline" : "destructive"}>{u.is_active ? "Active" : "Deactivated"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {!u.is_admin && (
                    <Button variant="ghost" size="sm" onClick={() => setActive(u, !u.is_active)}>
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
