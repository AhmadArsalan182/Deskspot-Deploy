import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { ROLES, homePathFor } from "../utils/roles.js";

/** Employees only ever see their own workspace. */
const EMPLOYEE_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/search", label: "Find a space", icon: Search },
  { to: "/bookings", label: "My bookings", icon: CalendarDays },
];

/** Administrators only see the management console — never employee screens. */
const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/occupancy", label: "Daily occupancy", icon: LayoutGrid },
  { to: "/admin/statistics", label: "Statistics", icon: Activity },
  { to: "/admin/locations", label: "Offices & spaces", icon: Building2 },
  { to: "/admin/bookings", label: "All bookings", icon: ClipboardList },
];

const COLLAPSE_KEY = "deskspot.sidebar.collapsed";

function initials(fullName) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "true";
  } catch {
    return false;
  }
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const isAdmin = user.role === ROLES.ADMIN;
  const navItems = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // Storage blocked — the rail simply resets on the next visit.
      }
      return next;
    });
  }

  return (
    <div className={`app-shell${collapsed ? " app-shell--collapsed" : ""}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="topbar">
        <Link to={homePathFor(user.role)} className="brand">
          <span className="brand__mark">D</span>
          <span className="brand__text">DeskSpot</span>
        </Link>
        <button
          type="button"
          className="icon-btn"
          aria-label="Open navigation"
          aria-expanded={open}
          aria-controls="sidebar"
          onClick={() => setOpen(true)}
        >
          <Menu size={20} aria-hidden="true" />
        </button>
      </header>

      {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <aside id="sidebar" className={`sidebar${open ? " sidebar--open" : ""}`}>
        <div className="sidebar__top">
          <Link
            to={homePathFor(user.role)}
            className="brand brand--light"
            onClick={() => setOpen(false)}
            title="DeskSpot"
          >
            <span className="brand__mark">D</span>
            <span className="brand__text">DeskSpot</span>
          </Link>
          <button
            type="button"
            className="icon-btn icon-btn--dark sidebar__close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="Main">
          <p className="nav-section">{isAdmin ? "Administration" : "Workspace"}</p>
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="nav-link"
              title={label}
              onClick={() => setOpen(false)}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="nav-link__label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div className="user-chip">
            <span className="avatar" aria-hidden="true">{initials(user.fullName)}</span>
            <div className="user-chip__text">
              <div className="user-chip__name">{user.fullName}</div>
              <div className="user-chip__role">{isAdmin ? "Administrator" : "Employee"}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--ghost sidebar__collapse"
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
            <span className="nav-link__label">Collapse</span>
          </button>
          <button type="button" className="btn btn--ghost" onClick={logout} title="Log out">
            <LogOut size={18} aria-hidden="true" />
            <span className="nav-link__label">Log out</span>
          </button>
        </div>
      </aside>

      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
