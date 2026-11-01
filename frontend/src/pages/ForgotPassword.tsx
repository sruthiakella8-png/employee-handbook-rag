import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/AuthShell";
import { EmailInput } from "@/components/AuthFields";
import { ArrowLeftIcon, MailIcon } from "@/components/AuthIcons";
import { requestPasswordReset } from "@/lib/auth";

const RESEND_SECONDS = 30;

function BackToSignIn() {
  return (
    <Link
      to="/"
      className="inline-flex items-center justify-center gap-1.5 text-sm text-primary hover:underline"
    >
      <ArrowLeftIcon size={14} />
      Back to sign in
    </Link>
  );
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Tick the resend countdown once a second while it is running.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function send() {
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server. Is Django running?"
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  if (sent) {
    return (
      <AuthShell
        icon={<MailIcon size={26} />}
        title="Check your inbox"
        subtitle={
          <>
            If an account exists for <strong className="font-semibold text-foreground">{email}</strong>, a
            reset link is on its way. It works once and expires in 1 hour.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void send()}
            disabled={loading || cooldown > 0}
          >
            {loading ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend the link"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Nothing yet? Check your spam folder, or make sure you used your work email.
          </p>
          <BackToSignIn />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      icon={<MailIcon size={26} />}
      title="Reset your password"
      subtitle="Enter your work email and we'll send you a link to choose a new one."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <EmailInput id="email" value={email} onChange={setEmail} placeholder="you@nimbustech.com" required />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </Button>
        <BackToSignIn />
      </form>
    </AuthShell>
  );
}
