import { useNavigate } from "react-router-dom";
import BackButton from "../components/common/BackButton";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <main className="screen-task legal-page" aria-labelledby="privacy-title">
      <BackButton onClick={() => navigate(-1)} />
      <span className="eyebrow">CAMPUS CONNECT · VERSION 2026-10-11</span>
      <h1 className="display" id="privacy-title">Privacy Policy</h1>
      <p className="subtitle">Effective date: 11 October 2026</p>

      <div className="legal-body">
        <p>
          This Policy explains what information Campus Connect handles, why it is used, and choices
          available to you. Campus Connect is in active development, so some controls described here
          may not yet be available in the app. Do not post information you would not want other
          people using the service to see.
        </p>

        <h2>1. Information we handle</h2>
        <ul>
          <li>
            <strong>Account information:</strong> email address used for authentication, username,
            name, faculty, department, level, profile photo and any bio you provide.
          </li>
          <li>
            <strong>Content and activity:</strong> posts, uploaded media, replies, likes, and related
            timestamps or counts needed to display conversations and operate the feed.
          </li>
          <li>
            <strong>Security and technical information:</strong> authentication/session data handled
            by the sign-in provider, request and error information, and limited rate-limit signals
            used to protect account and service endpoints.
          </li>
        </ul>

        <h2>2. How we use information</h2>
        <p>
          We use information to create and secure accounts, show profiles and content, deliver the
          feed and conversation features, process likes and replies, support user safety, prevent
          abuse, troubleshoot errors, and maintain the service. A unique signed-in account may be
          counted when it opens a post; the view counter is an aggregate and does not expose the list
          of viewers through the client interface.
        </p>

        <h2>3. What other users can see</h2>
        <p>
          Your username, profile details and content are displayed according to the service's current
          interface and access rules. Posts and replies are intended to be visible to other users of
          Campus Connect. Uploaded media may use shareable storage URLs, which means a person who has
          a media link may be able to access that file outside the app. Do not upload sensitive
          documents, financial details, passwords, or content you do not have permission to share.
          Your authentication email is used for account access and is not intended to be displayed as
          your public username.
        </p>

        <h2>4. Service providers and sharing</h2>
        <p>
          Campus Connect uses third-party infrastructure to operate, including Supabase for database,
          authentication, storage and server functions, and Vercel for application hosting and
          deployment. Those providers process information as needed to provide their services. We do
          not sell profile or post information as a data-broker product. Information may also be
          processed when necessary to address abuse, protect users or the service, comply with law, or
          establish or defend legal rights.
        </p>

        <h2>5. Storage and security</h2>
        <p>
          We use access controls and security measures intended to protect account and service data.
          No online service can guarantee absolute security. Keep your password private, sign out of
          shared devices, and contact the service operator if you suspect unauthorised access. Public
          or shareable media links should be treated as links that may be forwarded.
        </p>

        <h2>6. Retention, deletion and requests</h2>
        <p>
          Information is retained for as long as reasonably necessary to provide the service, maintain
          security, resolve disputes, and meet legal obligations. Account deletion and data export
          controls are planned but may not yet be available in the interface. The service operator
          must publish an official support contact before public launch so users can request access to
          or correction of their information, ask questions, or request deletion where applicable.
        </p>

        <h2>7. Your choices</h2>
        <p>
          You can choose what profile details and content you submit. You can edit profile fields that
          the app exposes for editing. Where applicable law provides privacy rights, you may exercise
          those rights through the official contact channel once it is published. Some processing is
          necessary to provide authentication, account security and the core service.
        </p>

        <h2>8. Changes to this Policy</h2>
        <p>
          We may update this Policy as Campus Connect adds features or changes its data practices.
          Material changes will be reflected in the version date at the top of this page. Please review
          this Policy when you see a new version during signup or account use.
        </p>

        <h2>9. Contact</h2>
        <p>
          The service operator should publish an official Campus Connect privacy/support contact
          before public launch. This Policy is an operational description of current intended data
          handling and should receive appropriate privacy/legal review before broad public release.
        </p>
      </div>
    </main>
  );
}
