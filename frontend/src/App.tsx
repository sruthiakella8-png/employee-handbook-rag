import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";import Login from "@/pages/Login";
import Chat from "@/pages/Chat";
import Admin from "@/pages/Admin";
import RequireAuth from "@/components/RequireAuth";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/chat" element={<RequireAuth><Chat /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth adminOnly><Admin /></RequireAuth>} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Routes>
    </BrowserRouter>
  );
}