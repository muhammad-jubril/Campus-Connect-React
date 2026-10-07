import { useNavigate, Link } from "react-router-dom";
import BackButton from "../components/common/BackButton";

const LAST_UPDATED = "7 October 2026";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <div className="screen-task" style={{ padding: 20 }}>
      <BackButton onClick={() => navigate(-1)} />
      <h2 className="display">Privacy Policy</h2>
      <p className="subtitle">Last updated {LAST_UPDATED}</p>

      <div className="legal-body">
        <p>
          This Privacy Policy explains how Campus Connect collects, uses,
          stores, and protects personal data when you use the service. Campus
          Connect is designed for the NWU campus community in Nigeria and is
          operated with the requirements of the Nigeria Data Protection Act,
          2023 (NDP Act) in mind.
        </p>

        <h3>1. Personal data we collect</h3>
        <p>
          Depending on how you use Campus Connect, we may collect your name,
          username, email address, faculty, department, academic level, profile
          photo, posts, comments, and other information you choose to provide
          in the service. We also process account and technical information
          needed to authenticate you, keep the service secure, and operate the
          app.
        </p>

        <h3>2. How we use your data</h3>
        <p>
          We use your data to create and secure your account, display your
          profile to other Campus Connect users, deliver posts and comments,
          provide account recovery and notifications, prevent abuse and fraud,
          troubleshoot problems, and improve the reliability and safety of the
          service.
        </p>

        <h3>3. What other users can see</h3>
        <p>
          Campus Connect is a social platform. Information you place in your
          public profile and content you post may be visible to other people who
          use the service. Do not publish information that you do not want other
          campus users to see.
        </p>

        <h3>4. Service providers and storage</h3>
        <p>
          Campus Connect relies on third-party infrastructure providers for
          services such as authentication, database storage, file storage, and
          hosting. They process information as necessary to provide those
          services to Campus Connect, subject to their own terms and applicable
          data-protection obligations.
        </p>

        <h3>5. Sharing and sale of data</h3>
        <p>
          We do not sell your personal data. We may disclose information when
          necessary to provide the service, protect users and the service,
          comply with a lawful request, enforce our Terms, or protect legal
          rights and safety.
        </p>

        <h3>6. Retention and deletion</h3>
        <p>
          We keep personal data for as long as reasonably necessary to provide
          the service and for security, legal, and operational purposes. You may
          request deletion of your account and personal data through the
          available Campus Connect support/contact channel. Some data may be
          retained where required by law or where reasonably necessary to
          address security, fraud, disputes, or other legitimate needs.
        </p>

        <h3>7. Your data-protection rights</h3>
        <p>
          Subject to the NDP Act and applicable limits, you may have rights to
          be informed, access your personal data, request correction, object to
          certain processing, restrict processing, request portability, and ask
          for erasure or withdrawal of consent where consent is the lawful basis.
          You may also lodge a complaint with the Nigeria Data Protection
          Commission (NDPC).
        </p>

        <h3>8. Children and minimum age</h3>
        <p>
          Campus Connect sets a minimum user age of 18. The NDP Act contains
          additional safeguards for processing children’s personal data,
          including requirements concerning parental or guardian consent where
          applicable. Because Campus Connect is designed for a university
          community, we do not offer the service to users under 18.
        </p>

        <h3>9. Security</h3>
        <p>
          We use reasonable technical and organisational measures to protect
          personal data against unauthorised access, loss, misuse, alteration,
          or disclosure. No online service can guarantee absolute security, so
          you should also protect your password and device.
        </p>

        <h3>10. Contact and complaints</h3>
        <p>
          Privacy questions or requests should be sent through the official
          Campus Connect support/contact channel made available with the app.
          You may also contact the NDPC through its official channels if you
          believe a data-protection concern has not been adequately addressed.
        </p>

        <p style={{ marginTop: 18 }}>
          Read the governing law directly from the official NDPC publication of
          the <a href="https://ndpc.gov.ng/wp-content/uploads/2024/03/Nigeria_Data_Protection_Act_2023.pdf" target="_blank" rel="noreferrer">Nigeria Data Protection Act, 2023</a>.
        </p>

        <p style={{ marginTop: 18 }}>
          Our <Link to="/terms">Terms of Use</Link> apply alongside this
          Privacy Policy.
        </p>
      </div>
    </div>
  );
}
