import { useNavigate, Link } from "react-router-dom";
import BackButton from "../components/common/BackButton";

const LAST_UPDATED = "7 October 2026";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <div className="screen-task" style={{ padding: 20 }}>
      <BackButton onClick={() => navigate(-1)} />
      <h2 className="display">Terms of Use</h2>
      <p className="subtitle">Last updated {LAST_UPDATED}</p>

      <div className="legal-body">
        <p>
          These Terms of Use govern your use of Campus Connect, a student-focused
          social platform for Northwest University Kano (NWU) and its campus
          community. By creating an account or using the service, you agree to
          these Terms and to our <Link to="/privacy">Privacy Policy</Link>.
        </p>

        <h3>1. Eligibility</h3>
        <p>
          Campus Connect is intended for people who are at least 18 years old.
          By using the service, you confirm that you meet this minimum age and
          that the information you provide is truthful and current.
        </p>

        <h3>2. Your account</h3>
        <p>
          You are responsible for keeping your login credentials secure and for
          activity carried out through your account. Do not share your password,
          impersonate another person, or create an account using someone else’s
          identity or information.
        </p>

        <h3>3. What you may post</h3>
        <p>
          You may share lawful campus-related posts, photos, videos, comments,
          and profile information. You keep ownership of content you create,
          but you give Campus Connect permission to host, display, and process
          that content as necessary to operate the service.
        </p>

        <h3>4. Prohibited use</h3>
        <p>
          Do not use Campus Connect to harass, threaten, defraud, scam,
          impersonate, exploit, or unlawfully harm another person. Do not post
          unlawful, abusive, hateful, sexually explicit, or privacy-invasive
          material, distribute malware, attempt to bypass security controls,
          scrape private information, or interfere with the service.
        </p>

        <h3>5. Safety and moderation</h3>
        <p>
          Campus Connect may remove content, restrict accounts, or take other
          reasonable action when necessary for safety, security, legal
          compliance, or enforcement of these Terms. We cannot guarantee that
          every user-provided post is accurate, safe, or endorsed by Campus
          Connect.
        </p>

        <h3>6. Availability</h3>
        <p>
          We aim to keep Campus Connect available and secure, but the service
          may occasionally be unavailable because of maintenance, outages,
          updates, or circumstances outside our control.
        </p>

        <h3>7. Deletion and account closure</h3>
        <p>
          You may request deletion of your account and personal data through
          the available Campus Connect support channel. Some information may
          need to be retained where required by law, for security, or to
          resolve disputes.
        </p>

        <h3>8. Changes to these Terms</h3>
        <p>
          We may update these Terms when the service changes or when legal or
          safety requirements change. We will publish the updated version here
          with a new “Last updated” date.
        </p>

        <h3>9. Contact</h3>
        <p>
          Questions about these Terms should be sent through the official
          Campus Connect support/contact channel made available with the app.
        </p>

        <p style={{ marginTop: 18 }}>
          Campus Connect operates in Nigeria and will apply applicable Nigerian
          law to the service, subject to any mandatory rights or protections
          that apply to you.
        </p>
      </div>
    </div>
  );
}
