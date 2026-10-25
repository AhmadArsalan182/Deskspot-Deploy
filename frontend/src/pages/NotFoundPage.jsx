import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div className="center-screen">
      <div>
        <h1>Page not found</h1>
        <p className="muted">The page you are looking for does not exist.</p>
        <Link to="/login" className="btn btn--primary">Go to DeskSpot</Link>
      </div>
    </div>
  );
}
