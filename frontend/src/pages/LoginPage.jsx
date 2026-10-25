import { useState } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { KeyRound, ShieldAlert } from "lucide-react";
import Alert from "../components/Alert.jsx";
import FormField from "../components/FormField.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { PORTALS, portalFromSearch } from "../utils/roles.js";

export default function LoginPage() {
  const { login } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const portal = portalFromSearch(searchParams);

  const [form, setForm] = useState({ email: "", password: "" });
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  // Landing here without a portal choice sends the visitor back to the picker,
  // which is what keeps the employee and admin entrances separate.
  if (!portal) return <Navigate to="/" replace />;

  const meta = PORTALS[portal];

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFeedback(null);
    setLoading(true);
    try {
      await login({ ...form, portalRole: portal });
    } catch (err) {
      const attempts = err.details?.attemptsRemaining;
      const locked = err.code === "ACCOUNT_LOCKED";
      const mismatch = err.code === "ROLE_MISMATCH";

      let text = err.message;
      if (!locked && !mismatch && typeof attempts === "number" && attempts > 0) {
        text = `${err.message} ${attempts} attempt${attempts === 1 ? "" : "s"} left before this account is locked.`;
      }

      setFeedback({
        type: "error",
        text,
        // Offer the reset route as soon as the attempt budget runs low.
        offerReset: locked || (typeof attempts === "number" && attempts <= 1),
        mismatchRole: mismatch ? err.details?.actualRole : null,
      });
      setLoading(false);
    }
  }

  return (
    <>
      <div className="portal-heading">
        <span className={`portal-pill portal-pill--${portal === "ADMIN" ? "admin" : "employee"}`}>
          {meta.label}
        </span>
        <Link to="/" className="portal-switch">
          Switch portal
        </Link>
      </div>

      <h1>{meta.label} sign in</h1>
      <p>{meta.blurb}</p>

      {location.state?.registered && <Alert type="success">Account created. You can sign in now.</Alert>}
      {location.state?.reset && <Alert type="success">Password updated. Sign in with your new password.</Alert>}
      {feedback && <Alert type={feedback.type}>{feedback.text}</Alert>}

      {feedback?.mismatchRole && (
        <Alert type="warning">
          <ShieldAlert size={15} aria-hidden="true" /> This email belongs to the{" "}
          {PORTALS[feedback.mismatchRole]?.label} portal.{" "}
          <Link to={`/login?portal=${feedback.mismatchRole}`}>
            Sign in as {PORTALS[feedback.mismatchRole]?.label}
          </Link>
          .
        </Alert>
      )}

      {feedback?.offerReset && (
        <Alert type="warning">
          <KeyRound size={15} aria-hidden="true" /> Locked out or forgotten your password?{" "}
          <Link to={`/forgot-password?portal=${portal}`}>Reset it now</Link>.
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={handleChange}
        />
        <PasswordField
          name="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={handleChange}
        />
        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? "Signing in…" : `Sign in as ${meta.label.toLowerCase()}`}
        </button>
      </form>

      <p className="form-footer">
        <Link to={`/forgot-password?portal=${portal}`}>Forgot your password?</Link>
      </p>
      <p className="form-footer">
        No account yet? <Link to={`/register?portal=${portal}`}>Register as {meta.label.toLowerCase()}</Link>
      </p>
    </>
  );
}
