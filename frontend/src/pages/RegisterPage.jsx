import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import FormField from "../components/FormField.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { register } from "../services/auth.js";
import { PORTALS, portalFromSearch } from "../utils/roles.js";

function validate({ fullName, email, password, inviteCode }, requireInvite) {
  const errors = {};
  if (!fullName.trim()) errors.fullName = "Enter your full name.";
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Enter a valid email address.";
  if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (requireInvite && !inviteCode.trim()) errors.inviteCode = "Administrator accounts need an invite code.";
  return errors;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const portal = portalFromSearch(searchParams);

  const [form, setForm] = useState({ fullName: "", email: "", password: "", inviteCode: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!portal) return <Navigate to="/" replace />;

  const meta = PORTALS[portal];
  const isAdmin = portal === "ADMIN";

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    const errors = validate(form, isAdmin);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        role: portal,
        adminInviteCode: isAdmin ? form.inviteCode : undefined,
      });
      navigate(`/login?portal=${portal}`, { state: { registered: true } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="portal-heading">
        <span className={`portal-pill portal-pill--${isAdmin ? "admin" : "employee"}`}>{meta.label}</span>
        <Link to="/" className="portal-switch">
          Switch portal
        </Link>
      </div>

      <h1>{isAdmin ? "Create an administrator account" : "Create your account"}</h1>
      <p>
        {isAdmin
          ? "Administrator accounts are limited to the workplace team and need the shared invite code."
          : "Register with your work email to start booking desks and meeting rooms."}
      </p>

      {error && <Alert>{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Full name"
          name="fullName"
          autoComplete="name"
          value={form.fullName}
          onChange={handleChange}
          error={fieldErrors.fullName}
        />
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />
        <PasswordField
          name="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={form.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />
        {isAdmin && (
          <FormField
            label="Admin invite code"
            name="inviteCode"
            autoComplete="off"
            hint="Ask the workplace team for the code that unlocks administrator sign-up."
            value={form.inviteCode}
            onChange={handleChange}
            error={fieldErrors.inviteCode}
          />
        )}
        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? "Creating account…" : `Create ${meta.label.toLowerCase()} account`}
        </button>
      </form>

      <p className="form-footer">
        Already registered? <Link to={`/login?portal=${portal}`}>Sign in</Link>
      </p>
    </>
  );
}
