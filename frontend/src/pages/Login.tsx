import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/AuthShell";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import { EmailInput, PasswordInput } from "@/components/AuthFields";
import { LockIcon } from "@/components/AuthIcons";
import { login, loginWithGoogle } from "@/lib/auth";

const DEMO_EMAIL = "demo@nimbus.com";
const DEMO_PASSWORD = "__s5OC17bLCv";

function describe(err: unknown, fallback: string) {
  if (err instanceof TypeError) return "Couldn't reach the server. Is Django running?";
  return err instanceof Error ? err.message : fallback;
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const busy = loading || demoLoading;
  const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/chat");
    } catch (err) {
      setError(describe(err, "Login failed."));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle(credential: string) {
    setError("");
    try {
      await loginWithGoogle(credential);
      navigate("/chat");
    } catch (err) {
      setError(describe(err, "Google sign-in failed."));
    }
  }

  async function handleDemo() {
    setError("");
    setDemoLoading(true);
    try {
      await login(DEMO_EMAIL, DEMO_PASSWORD);
      navigate("/chat");
    } catch (err) {
      setError(describe(err, "Couldn't sign in to the demo account."));
      setDemoLoading(false);
    }
  }

  return (
    <AuthShell
      icon={<LockIcon size={26} />}
      title="Sign in"
      subtitle="Use your work email to ask the handbook."
    >
      {googleEnabled && (
        <div className="flex flex-col gap-5">
          <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or use your email</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Work email</Label>
          <EmailInput
            id="email"
            value={email}
            onChange={setEmail}
            placeholder="you@nimbustech.com"
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            placeholder="Your password"
            required
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="flex flex-col gap-3 border-t pt-5 text-center text-sm text-muted-foreground">
        {demoLoading ? (
          <p role="status">Signing in as the demo account…</p>
        ) : (
          <p>
            Just looking around?{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline disabled:opacity-50"
              onClick={handleDemo}
              disabled={busy}
            >
              Try the demo account
            </button>
          </p>
        )}
        <p>Need access? Contact your HR admin.</p>
      </div>
    </AuthShell>
  );
}
