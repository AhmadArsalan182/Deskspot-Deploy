import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Alert from "../components/Alert.jsx";
import PasswordField from "../components/PasswordField.jsx";
import { resetPassword } from "../services/auth.js";
import { PORTALS, portalFromSearch } from "../utils/roles.js";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const portal = portalFromSearch(searchParams) ?? PORTALS.EMPLOYEE.role;

  const [form, setForm] = useState({ password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const mismatch = form.confirm.length > 0 && form.password !== form.confirm;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword({ token, password: form.password });
      navigate(`/login?portal=${portal}`, { state: { reset: true } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1>Reset link missing</h1>
        <Alert>This page needs a reset link. Request a new one to continue.</Alert>
        <p className="form-footer">
          <Link to={`/forgot-password?portal=${portal}`}>Request a new reset link</Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Choose a new password</h1>
      <p>Your account will be unlocked as soon as the new password is saved.</p>

      {error && <Alert>{error}</Alert>}

      <form onSubmit={handleSubmit} noValidate>
        <PasswordField
          label="New password"
          name="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          required
          value={form.password}
          onChange={(event) => setForm({ ...form, password: event.target.value })}
        />
        <PasswordField
          label="Confirm new password"
          name="confirm"
          autoComplete="new-password"
          required
          value={form.confirm}
          onChange={(event) => setForm({ ...form, confirm: event.target.value })}
          error={mismatch ? "The two passwords do not match." : undefined}
        />
        <button className="btn btn--primary btn--block" type="submit" disabled={loading || mismatch}>
          {loading ? "Saving…" : "Save new password"}
        </button>
      </form>

      <p className="form-footer">
        <Link to={`/login?portal=${portal}`}>Back to sign in</Link>
      </p>
    </>
  );
}
