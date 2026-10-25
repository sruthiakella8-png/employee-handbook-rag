import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { getSession } from "@/lib/auth";

export default function RequireAuth({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  const session = getSession();
  if (!session) return <Navigate to="/" replace />;
  if (adminOnly && !session.is_admin) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}