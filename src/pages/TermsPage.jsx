import { useNavigate } from "react-router-dom";
import BackButton from "../components/common/BackButton";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <main className="screen-task legal-page" aria-labelledby="terms-title">
      <BackButton onClick={() => navigate(-1)} />
      <span className="eyebrow">CAMPUS CONNECT · VERSION 2026-10-11 · v2</span>
      <h1 className="display" id="terms-title">Terms of Use</h1>
      <p className="subtitle">Effective date: 11 October 2026</p>

      <div className="legal-body">
        <p>
          These Terms govern your use of Campus Connect, a campus-focused social platform for
          student-community profiles and discussion. By creating an account or using the service,
          you agree to these Terms. The Privacy Policy explains how personal information is handled.
          These Terms are a product-policy draft and should be reviewed by a qualified Nigerian
          legal professional before public launch.
        </p>

        <h2>1. About the service</h2>
        <p>
          Campus Connect may provide profiles, posts, replies, reactions, media sharing, search and
          other community features as they become available. Campus Connect is an independent project
          and is not an official communication channel, or an endorsement, of Northwest University
          Kano or any other institution unless the operator expressly states otherwise.
        </p>

        <h2>2. Eligibility and accounts</h2>
        <p>
          You must be at least 18 years old to create or use an account. The service is not designed
          for children, and you must not register if you are under 18. Do not provide another
          person's information as your own. Use an email address you control, provide accurate
          profile details, keep your password private, and notify the operator if you suspect
          unauthorised access. You are responsible for activity carried out through your account,
          except where applicable law provides otherwise.
        </p>

        <h2>3. Respectful and lawful use</h2>
        <p>You must not use Campus Connect to:</p>
        <ul>
          <li>harass, threaten, stalk, intimidate or target another person;</li>
          <li>publish private personal information or images without an appropriate right or permission;</li>
          <li>share unlawful, fraudulent, deceptive, hateful or sexually exploitative material;</li>
          <li>spam users, manipulate engagement, distribute malware or interfere with the service;</li>
          <li>infringe copyright, trademarks, privacy or other rights; or</li>
          <li>bypass security controls, probe for weaknesses without authorisation, or access data you are not allowed to access.</li>
        </ul>

        <h2>4. Content you share</h2>
        <p>
          You retain rights you hold in content you create. You grant the operator a limited,
          non-exclusive permission to host, store, process, reproduce and display that content as
          reasonably necessary to operate, secure and provide the features you use. Only share
          content you have the right to upload. Unless a feature clearly indicates otherwise, treat
          profile details, posts, replies and uploaded media as content that other users may see or
          access. Do not post passwords, identity documents, financial details or other sensitive
          information that is not needed for the service.
        </p>

        <h2>5. Safety and enforcement</h2>
        <p>
          The operator may review content or account activity where reasonably necessary to
          investigate reported issues, protect users or systems, enforce these Terms, or comply with
          law. Depending on the circumstances and on controls available in the product, content may
          be removed or access may be limited, suspended or terminated. Some reporting, blocking,
          muting, account-management or other safety controls may not yet be available in the app.
          Do not rely on a control that is not visibly provided.
        </p>

        <h2>6. Third-party services and transactions</h2>
        <p>
          Campus Connect uses third-party infrastructure to operate. Third-party services are subject
          to their own terms and privacy notices. If user-to-user exchanges or marketplace features
          become available, users are responsible for evaluating listings and arranging transactions.
          The operator does not guarantee another user's identity, the quality or availability of an
          item, payment, delivery or the outcome of an interaction.
        </p>

        <h2>7. Availability and changes</h2>
        <p>
          Campus Connect is under active development. Features may change, be interrupted or be
          discontinued. We aim to maintain a useful service but do not promise uninterrupted or
          error-free operation. Material changes to these Terms will be reflected in the version date
          shown above.
        </p>

        <h2>8. Ending use and account requests</h2>
        <p>
          You may stop using Campus Connect at any time. The operator may restrict or terminate an
          account where reasonably necessary to address serious or repeated violations, protect
          people or systems, comply with law, or maintain the service. If an in-app account deletion
          or data-export control is not available, use the privacy contact details that the operator
          must publish before public launch to make a request.
        </p>

        <h2>9. Privacy and applicable law</h2>
        <p>
          Your use of the service is subject to the Privacy Policy. The operator intends to handle
          personal data with regard to applicable Nigerian data-protection law, including the Nigeria
          Data Protection Act 2023. This statement is not a representation that every legal
          obligation has been independently audited or satisfied.
        </p>

        <h2>10. Contact and legal review</h2>
        <p>
          Before public launch, the operator must publish its responsible legal identity and a
          monitored support/privacy contact. Those details are not yet provided in this draft.
          Nothing in these Terms excludes a right or remedy that cannot lawfully be excluded. This
          document is not legal advice and should receive professional review before release.
        </p>
      </div>
    </main>
  );
}
