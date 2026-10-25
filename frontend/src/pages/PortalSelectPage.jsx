import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, ShieldCheck } from "lucide-react";
import { PORTALS } from "../utils/roles.js";

const CARDS = [
  { key: PORTALS.EMPLOYEE.role, ...PORTALS.EMPLOYEE, icon: Briefcase, accent: "employee" },
  { key: PORTALS.ADMIN.role, ...PORTALS.ADMIN, icon: ShieldCheck, accent: "admin" },
];

/**
 * The first thing a visitor sees. Instead of demo shortcuts this asks which
 * portal they belong to, and every link downstream carries that choice so the
 * two entrances can never be mixed up.
 */
export default function PortalSelectPage() {
  return (
    <>
      <h1>How would you like to sign in?</h1>
      <p>Pick your portal. You will only be able to sign in or register for the one you choose.</p>

      <div className="portal-grid">
        {CARDS.map(({ key, title, blurb, icon: Icon, accent }) => (
          <section key={key} className={`portal-card portal-card--${accent}`}>
            <span className="portal-card__icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h2>{title}</h2>
            <p>{blurb}</p>
            <div className="portal-card__actions">
              <Link to={`/login?portal=${key}`} className="btn btn--primary btn--block">
                Sign in <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link to={`/register?portal=${key}`} className="btn btn--secondary btn--block">
                Create an account
              </Link>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
