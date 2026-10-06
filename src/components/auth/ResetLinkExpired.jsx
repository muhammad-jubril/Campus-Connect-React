import { Link } from "react-router-dom";

export default function ResetLinkExpired({ detail }) {
  return (
    <div className="screen-enter">
      <div className="eyebrow">PASSWORD RESET</div>
      <h2 className="display">This reset link is invalid or has expired.</h2>
      <p className="subtitle">
        {detail || "Request a new password reset link to continue."}
      </p>

      <div className="spacer" />
      <Link to="/forgot-password" className="btn btn-primary">
        Request a new link
      </Link>
    </div>
  );
}
