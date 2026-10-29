import { useEffect, useRef } from "react";

// Minimal types for the part of Google Identity Services we use.
type GoogleId = {
  initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google) return resolve();
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const isNew = !script;
    if (!script) {
      script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
    }
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error("Couldn't load Google sign-in.")));
    if (isNew) document.head.appendChild(script);
  });
}

type Props = {
  onCredential: (credential: string) => void;
  onError?: (message: string) => void;
};

/** Google's own "Sign in with Google" button. Renders nothing if no client ID is configured. */
export default function GoogleSignInButton({ onCredential, onError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });

  useEffect(() => {
    handlers.current = { onCredential, onError };
  });

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google || !container.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => handlers.current.onCredential(response.credential),
        });
        window.google.accounts.id.renderButton(container.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          width: Math.min(400, container.current.offsetWidth || 320),
        });
      })
      .catch((err: Error) => handlers.current.onError?.(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!CLIENT_ID) return null;
  return <div ref={container} className="flex w-full justify-center" />;
}
