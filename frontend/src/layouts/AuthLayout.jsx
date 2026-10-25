import { Navigate, Outlet } from "react-router-dom";
import { CalendarCheck, Clock, MapPin } from "lucide-react";
import LoadingScreen from "../components/LoadingScreen.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { homePathFor } from "../utils/roles.js";

export default function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to={homePathFor(user.role)} replace />;

  return (
    <div className="auth">
      <aside className="auth__brand">
        <span className="brand brand--light">
          <span className="brand__mark">D</span> DeskSpot
        </span>
        <div>
          <h2>Your workspace, ready when you are.</h2>
          <p>Book desks and meeting rooms across Islamabad, Riyadh and Copenhagen in a few clicks.</p>
          <ul className="auth__points">
            <li><MapPin aria-hidden="true" /> Three offices, one booking portal</li>
            <li><Clock aria-hidden="true" /> Real-time availability in office-local time</li>
            <li><CalendarCheck aria-hidden="true" /> No more double-booked meeting rooms</li>
          </ul>
        </div>
        <small>Internal workplace tool</small>
      </aside>
      <main className="auth__panel" id="main">
        <div className="auth__form">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
