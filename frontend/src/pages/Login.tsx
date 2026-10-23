import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.07-1.47-.22-2.12H12v3.85h6.6c-.13 1.1-.86 2.76-2.47 3.88l-.02.15 3.59 2.78.25.02c2.28-2.1 3.57-5.2 3.57-8.56" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.79-2.94c-1.02.71-2.38 1.2-4.16 1.2-3.18 0-5.88-2.1-6.84-5l-.14.01-3.73 2.89-.05.13C3.25 21.3 7.3 24 12 24" />
      <path fill="#FBBC05" d="M5.16 14.36A7.4 7.4 0 0 1 4.75 12c0-.82.15-1.62.4-2.36l-.01-.16-3.78-2.94-.12.06A12 12 0 0 0 0 12c0 1.93.46 3.76 1.24 5.36z" />
      <path fill="#EA4335" d="M12 4.76c2.25 0 3.77.97 4.64 1.79l3.39-3.31C17.95 1.19 15.24 0 12 0 7.3 0 3.25 2.7 1.24 6.64l3.91 3.04c.97-2.9 3.67-5 6.85-5" />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Connected to the Django login endpoint in a later step.
    console.log("Sign in clicked", { email });
    navigate("/chat");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              N
            </div>
            <h1 className="text-lg font-semibold">Nimbus HR Assistant</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to ask questions about your employee handbook
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@nimbustech.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex justify-end">
              <a href="#" className="text-xs text-primary hover:underline">
                Forgot password?
              </a>
            </div>

            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button type="button" variant="outline" className="w-full">
            <GoogleIcon />
            Sign in with Google
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            New here?{" "}
            <a href="#" className="text-primary hover:underline">
              Create an account
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}