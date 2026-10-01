import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <h2 className="display">Page not found</h2>
      <Link to="/" className="btn btn-primary" style={{ display: "inline-flex", width: "auto", marginTop: 16 }}>Go home</Link>
    </div>
  );
}
