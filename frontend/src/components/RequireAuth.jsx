import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import ForbiddenPage from "../pages/ForbiddenPage.jsx";
import LoadingScreen from "./LoadingScreen.jsx";

export default function RequireAuth({ role }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <ForbiddenPage />;

  return <Outlet />;
}
