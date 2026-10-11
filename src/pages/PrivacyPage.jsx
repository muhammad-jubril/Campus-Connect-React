import { useNavigate } from "react-router-dom";
import BackButton from "../components/common/BackButton";

export default function PrivacyPage() {
  const navigate = useNavigate();

  return (
    <main className="screen-task legal-page" aria-labelledby="privacy-title">
      <BackButton onClick={() => navigate(-1)} />
      <span className="eyebrow">CAMPUS CONNECT · VERSION 2026-10-11 · v2</span>
      <h1 className="display" id="privacy-title">Privacy Policy</h1>
      <p className="subtitle">Effective date: 11 October 2026</p>

      <div className="legal-body">
        <p>
          This Policy describes personal information that Campus Connect is designed to handle, why
          it is used, how it may be shared, and choices available to users. It is an operational
          draft for a product in development, not a legal opinion or a certification of compliance.
          The service operator should obtain a review against the Nigeria Data Protection Act 2023
          and the product's actual deployed configuration before public launch.
        </p>

        <h2>1. Who is responsible?</h2>
        <p>
          The Campus Connect operator is responsible for deciding how and why personal information is
          processed. The operator's full legal identity and a monitored privacy contact are not yet
          published in this draft. Those details must be added before public launch so users know
          who to contact about their data and how to make a request.
        </p>

        <h2>2. Information we collect or generate</h2>
        <ul>
          <li><strong>Account and profile information:</strong> email address used for authentication, username, name, faculty, department, level, profile photo, and optional profile bio or other fields you choose to add.</li>
          <li><strong>Content and activity:</strong> posts, uploaded media, replies, reactions and the timestamps or counts needed to operate the feed and display conversations.</li>
          <li><strong>Authentication and security information:</strong> sign-in/session information handled by the authentication provider, account-verification status, and limited technical or request signals used for troubleshooting, abuse prevention and rate limiting.</li>
          <li><strong>Support information:</strong> information you provide if you contact the operator once an official contact route is published.</li>
        </ul>
        <p>
          Do not submit passwords to posts, public profile fields, photos or support messages. The
          app asks for a profile photo but does not require you to upload one to use the service.
        </p>

        <h2>3. Why information is used</h2>
        <p>
          Information is used to create and secure accounts; verify email addresses; display
          profiles and user-generated content; provide feed, reply and reaction features; store
          profile photos and media; protect the service against spam, abuse and unauthorised access;
          diagnose faults; and maintain the product. The precise lawful basis for each processing
          activity must be documented by the operator before launch. Depending on the activity,
          the operator may rely on steps needed to provide the service, proportionate security
          interests, legal obligations, or consent where required or chosen for that activity.
        </p>

        <h2>4. Visibility and sharing between users</h2>
        <p>
          Usernames, profile details and posts are displayed according to the app's current
          interface and access rules. Posts and replies are intended for other Campus Connect users
          to see. Uploaded media may use shareable storage URLs; someone who obtains such a URL may
          be able to access the file outside the app. Do not upload sensitive documents or material
          you do not have permission to share. Your login email is used for account access and is
          not intended to appear as your public username.
        </p>

        <h2>5. Service providers and transfers</h2>
        <p>
          The project uses Supabase for authentication, database, storage and server functions and
          Vercel for hosting/deployment. These providers process information as needed to operate
          their services. Provider configuration, region, retention terms and any international
          transfers must be checked by the operator and handled using safeguards required by
          applicable law. Personal information is not sold as a data-broker product. Information may
          also be disclosed where reasonably necessary to protect users or systems, respond to valid
          legal process, or establish or defend legal rights.
        </p>

        <h2>6. Retention and security</h2>
        <p>
          Information should be retained only for as long as reasonably necessary for the purposes
          described in this Policy, including service operation, security, dispute handling and
          legal obligations. The operator should define retention periods for account records,
          content, diagnostic logs and backups before launch. Appropriate technical and
          organisational safeguards should be used, but no online service can guarantee absolute
          security. Public or shareable media links may be forwarded by anyone who has access to them.
        </p>

        <h2>7. Your privacy choices and rights</h2>
        <p>
          Subject to applicable law and any relevant exceptions, you may have rights to request
          access to personal data, correction of inaccurate data, erasure, restriction of processing,
          data portability, or to object to certain processing. Where processing relies on consent,
          you may withdraw that consent; withdrawal does not make earlier lawful processing unlawful
          and may affect a feature that depends on the information. You may also raise a concern with
          the Nigeria Data Protection Commission.
        </p>
        <p>
          In-app account deletion and data-export controls may not yet be available. The operator
          must publish a monitored contact route before launch and provide a process for receiving,
          verifying and responding to privacy requests. Do not send identity documents unless the
          operator provides a secure, appropriate process and explains why they are needed.
        </p>

        <h2>8. Children and minimum age</h2>
        <p>
          Campus Connect is intended for people aged 18 and over. Do not create an account or submit
          personal data if you are under 18. The product is not designed for children, and the
          operator must not knowingly retain an under-age account. If the operator learns that an
          account belongs to someone under 18, it should take appropriate steps to restrict the
          account and address associated personal data under applicable law.
        </p>

        <h2>9. Nigeria data-protection framework</h2>
        <p>
          This Policy is drafted with reference to the Nigeria Data Protection Act 2023, including
          its general principles and data-subject-rights framework. The official Act is available
          from the <a href="https://www.ndpc.gov.ng/ndp-act-2023/" target="_blank" rel="noreferrer">Nigeria Data Protection Commission</a>.
          This draft does not replace the operator's responsibility to assess lawful bases, security,
          retention, processors, transfers, child-safety safeguards and other obligations for the
          actual service.
        </p>

        <h2>10. Changes</h2>
        <p>
          If the data practices or product features materially change, this Policy should be updated
          and the version date changed. Where required, users should be given notice and a meaningful
          opportunity to exercise their choices.
        </p>

        <h2>11. Contact</h2>
        <p>
          A real, monitored privacy/support email and the operator's responsible legal identity must
          be inserted here before public launch. They are deliberately not invented in this draft.
          Until published, this contact section is incomplete and the Policy is not release-ready.
        </p>
      </div>
    </main>
  );
}
