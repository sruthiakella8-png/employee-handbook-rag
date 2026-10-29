import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/auth";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Is Django running?"
          : err instanceof Error
            ? err.message
            : "Couldn't reset the password. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const linkMissing = !uid || !token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              N
            </div>
            <h1 className="text-lg font-semibold">Choose a new password</h1>
          </div>

          {linkMissing ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                This reset link is incomplete. Please request a new one.
              </p>
              <Link to="/forgot-password" className="text-sm text-primary hover:underline">
                Request a new link
              </Link>
            </div>
          ) : done ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="rounded-lg border bg-muted/40 p-4 text-sm">
                Your password has been changed. You can sign in with it now.
              </p>
              <Button className="w-full" onClick={() => navigate("/")}>
                Go to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">
                  {error}{" "}
                  {error.includes("expired") && (
                    <Link to="/forgot-password" className="underline">
                      Request a new link
                    </Link>
                  )}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Saving…" : "Change password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
