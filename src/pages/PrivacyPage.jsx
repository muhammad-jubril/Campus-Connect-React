import { useNavigate } from "react-router-dom";
import BackButton from "../components/common/BackButton";

export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="screen-task" style={{ padding: 20 }}>
      <BackButton onClick={() => navigate(-1)} />
      <h2 className="display">Privacy Policy</h2>
      <p className="subtitle">Placeholder — final wording to come.</p>
      <div className="legal-body">
        <p>This is a placeholder for Campus Connect's Privacy Policy. The real text will replace this once it's ready — nothing here is final.</p>
      </div>
    </div>
  );
}
