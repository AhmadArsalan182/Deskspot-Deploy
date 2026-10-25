import { Navigate, Route, Routes } from "react-router-dom";
import RequireAuth from "./components/RequireAuth.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import AuthLayout from "./layouts/AuthLayout.jsx";
import AdminAllBookingsPage from "./pages/AdminAllBookingsPage.jsx";
import AdminDashboardPage from "./pages/AdminDashboardPage.jsx";
import AdminLocationsPage from "./pages/AdminLocationsPage.jsx";
import AdminOccupancyPage from "./pages/AdminOccupancyPage.jsx";
import AdminStatisticsPage from "./pages/AdminStatisticsPage.jsx";
import BookingsPage from "./pages/BookingsPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import PortalSelectPage from "./pages/PortalSelectPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import { ROLES } from "./utils/roles.js";

export default function App() {
  return (
    <Routes>
      {/* Public: choose a portal first, then sign in or register for it. */}
      <Route element={<AuthLayout />}>
        <Route path="/" element={<PortalSelectPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      {/* Employee workspace. */}
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/bookings" element={<BookingsPage />} />

          {/* Administrator console. */}
          <Route element={<RequireAuth role={ROLES.ADMIN} />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/occupancy" element={<AdminOccupancyPage />} />
            <Route path="/admin/statistics" element={<AdminStatisticsPage />} />
            <Route path="/admin/locations" element={<AdminLocationsPage />} />
            <Route path="/admin/bookings" element={<AdminAllBookingsPage />} />
            <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
