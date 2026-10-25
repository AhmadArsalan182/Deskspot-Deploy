import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { homePathFor } from "../utils/roles.js";

export default function ForbiddenPage() {
  const { user } = useAuth();

  return (
    <div className="card empty">
      <div className="empty__icon"><ShieldAlert size={26} aria-hidden="true" /></div>
      <h2>You do not have access to this page</h2>
      <p>This area is only available to administrators.</p>
      <Link to={homePathFor(user.role)} className="btn btn--primary">Back to my dashboard</Link>
    </div>
  );
}
