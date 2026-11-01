import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/AuthShell";
import { PasswordInput } from "@/components/AuthFields";
import { CheckIcon, ClockIcon, KeyIcon, RuleDot } from "@/components/AuthIcons";
import { resetPassword } from "@/lib/auth";

const REDIRECT_SECONDS = 5;

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
      <RuleDot ok={ok} />
      <span>
        {children}
        <span className="sr-only">{ok ? " (met)" : " (not met yet)"}</span>
      </span>
    </li>
  );
}

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
  const [expired, setExpired] = useState(false);
  const [redirectIn, setRedirectIn] = useState(REDIRECT_SECONDS);

  const longEnough = password.length >= 8;
  const notAllDigits = password.length > 0 && !/^\d+$/.test(password);
  const matches = password.length > 0 && password === confirm;
  const allMet = longEnough && notAllDigits && matches;

  // After success, count down and send the person to sign in.
  useEffect(() => {
    if (!done) return;
    if (redirectIn <= 0) {
      navigate("/");
      return;
    }
    const id = window.setTimeout(() => setRedirectIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [done, redirectIn, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!allMet) return;
    setLoading(true);
    try {
      await resetPassword(uid, token, password);
      setDone(true);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Couldn't reach the server. Is Django running?"
          : err instanceof Error
            ? err.message
            : "Couldn't reset the password. Please try again.";
      if (/expired|invalid/i.test(message)) setExpired(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!uid || !token || expired) {
    return (
      <AuthShell
        icon={<ClockIcon size={26} />}
        title={expired ? "This link has expired" : "This link is incomplete"}
        subtitle="Reset links work once and last for an hour. Request a fresh one and we'll email it right away."
      >
        <Button className="w-full" onClick={() => navigate("/forgot-password")}>
          Request a new link
        </Button>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        icon={<CheckIcon size={28} className="animate-pop" />}
        title="Password changed"
        subtitle="You can sign in with your new password now."
      >
        <div className="flex flex-col gap-3">
          <Button className="w-full" onClick={() => navigate("/")}>
            Go to sign in
          </Button>
          <p role="status" className="text-center text-xs text-muted-foreground">
            Taking you there in {redirectIn}s
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={<KeyIcon size={26} />}
      title="Choose a new password"
      subtitle="Pick something you don't use anywhere else."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">New password</Label>
          <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="new-password" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <PasswordInput id="confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" required />
        </div>

        <div className="rounded-lg bg-muted/60 p-3">
          <ul className="flex flex-col gap-1.5 text-xs" aria-label="Password requirements">
            <Rule ok={longEnough}>At least 8 characters</Rule>
            <Rule ok={notAllDigits}>Not just numbers</Rule>
            <Rule ok={matches}>Matches the confirmation</Rule>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Very common passwords, and ones too similar to your email, are also turned down when you save.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading || !allMet}>
          {loading ? "Saving…" : "Change password"}
        </Button>
      </form>
    </AuthShell>
  );
}
