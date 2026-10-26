const DJANGO_URL = "http://127.0.0.1:8000";
const KEY = "nimbus_auth";

type Session = { access: string; refresh: string; email: string; is_admin: boolean };

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function logout() {
  localStorage.removeItem(KEY);
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${DJANGO_URL}/api/auth/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: email, password }),
  });
  if (!res.ok) {
    throw new Error(res.status === 401 ? "Incorrect email or password." : "Login failed. Please try again.");
  }
  const data = await res.json();
  const session = { access: data.access, refresh: data.refresh, email: data.email, is_admin: data.is_admin };
  saveSession(session);
  return session;
}

async function refreshAccess(): Promise<boolean> {
  const s = getSession();
  if (!s) return false;
  const res = await fetch(`${DJANGO_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: s.refresh }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  saveSession({ ...s, access: data.access });
  return true;
}

export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") ? path : `${DJANGO_URL}${path}`;
  const send = () =>
    fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${getSession()?.access ?? ""}` },
    });
  let res = await send();
  if (res.status === 401 && (await refreshAccess())) res = await send();
  return res;
}