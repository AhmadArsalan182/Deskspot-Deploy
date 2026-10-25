import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Alert from "../components/Alert.jsx";
import FormField from "../components/FormField.jsx";
import { forgotPassword } from "../services/auth.js";
import { PORTALS, portalFromSearch } from "../utils/roles.js";

export default function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  // Optional: only used to route the visitor back to the right entrance.
  const portal = portalFromSearch(searchParams) ?? PORTALS.EMPLOYEE.role;

  const [email, setEmail] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      // In development the API returns the one-time token so the flow can be
      // finished without a mail server; in production it is emailed instead.
      setResult(await forgotPassword({ email }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Link to={`/login?portal=${portal}`} className="portal-switch portal-switch--back">
        <ArrowLeft size={14} aria-hidden="true" /> Back to sign in
      </Link>

      <h1>Reset your password</h1>
      <p>
        Enter the email on your account and we will send a single-use reset link. It expires after 30
        minutes.
      </p>

      {error && <Alert>{error}</Alert>}

      {result && (
        <>
          <Alert type="success">{result.message}</Alert>
          {result.resetToken && (
            <Alert type="warning">
              <strong>Development mode:</strong> no mail server is configured, so here is your one-time
              link.{" "}
              <Link to={`/reset-password?portal=${portal}&token=${encodeURIComponent(result.resetToken)}`}>
                Continue to set a new password
              </Link>
              .
            </Alert>
          )}
        </>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <FormField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </>
  );
}
