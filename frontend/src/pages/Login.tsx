import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, useNavigate } from "react-router-dom";
import { login, loginWithGoogle } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
  e.preventDefault();
  setError("");
  setLoading(true);
  try {
    await login(email, password);
    navigate("/chat");
  } catch (err) {
    setError(
      err instanceof TypeError
        ? "Couldn't reach the server. Is Django running?"
        : err instanceof Error
          ? err.message
          : "Login failed.",
    );
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
       setError(err instanceof Error ? err.message : "Google sign-in failed.");
     }
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
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
  Forgot password?
</Link>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

             {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
     <>
       <div className="flex items-center gap-3">
         <div className="h-px flex-1 bg-border" />
         <span className="text-xs text-muted-foreground">or</span>
         <div className="h-px flex-1 bg-border" />
       </div>
       <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
     </>
   )}

                    <p className="text-center text-sm text-muted-foreground">
            Need access? Contact your HR admin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}