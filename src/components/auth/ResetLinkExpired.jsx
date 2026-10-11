import { Link } from "react-router-dom";

export default function ResetLinkExpired({ detail }) {
  return (
    <div className="screen-enter">
      <div className="eyebrow">PASSWORD RESET</div>
      <h2 className="display">This reset session is invalid or has expired.</h2>
      <p className="subtitle">
        {detail || "Request a new six-digit reset code to continue."}
      </p>

      <div className="spacer" />
      <Link to="/forgot-password" className="btn btn-primary">
        Request a new code
      </Link>
    </div>
  );
}
