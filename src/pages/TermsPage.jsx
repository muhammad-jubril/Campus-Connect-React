import { useNavigate } from "react-router-dom";
import BackButton from "../components/common/BackButton";

export default function TermsPage() {
  const navigate = useNavigate();

  return (
    <main className="screen-task legal-page" aria-labelledby="terms-title">
      <BackButton onClick={() => navigate(-1)} />
      <span className="eyebrow">CAMPUS CONNECT · VERSION 2026-10-11</span>
      <h1 className="display" id="terms-title">Terms of Use</h1>
      <p className="subtitle">Effective date: 11 October 2026</p>

      <div className="legal-body">
        <p>
          These Terms explain the rules for using Campus Connect, a campus-focused social platform
          being developed for students and members of the university community. By creating an
          account or using the service, you agree to these Terms and the Privacy Policy.
        </p>

        <h2>1. About Campus Connect</h2>
        <p>
          Campus Connect provides profiles, posts, replies, reactions, media sharing and other
          community features as they become available. Unless Campus Connect explicitly says
          otherwise, it is an independent project and is not an official communication channel or
          endorsement of Northwest University Kano or any other institution.
        </p>

        <h2>2. Your account</h2>
        <p>
          Provide accurate information, keep your sign-in credentials private, and tell us promptly
          if you believe someone else has accessed your account. You are responsible for activity
          performed through your account. Do not impersonate another person, claim an affiliation
          you do not have, or create accounts to evade a restriction.
        </p>

        <h2>3. Respectful and lawful use</h2>
        <p>You must not use Campus Connect to:</p>
        <ul>
          <li>harass, threaten, stalk, intimidate or target another person;</li>
          <li>publish private personal information without permission;</li>
          <li>share unlawful, fraudulent, deceptive, hateful or sexually exploitative content;</li>
          <li>spam users, manipulate engagement, distribute malware or interfere with the service;</li>
          <li>infringe copyright, trademarks, privacy, or other rights; or</li>
          <li>circumvent security controls or access data you are not authorised to access.</li>
        </ul>

        <h2>4. Posts and other content</h2>
        <p>
          You retain ownership of content you create, subject to rights others may have in it. You
          give Campus Connect permission to host, store, process, display and distribute that content
          as reasonably necessary to operate, secure and improve the service. Only upload content
          you have the right to share. Content you post, your profile information, and media links may
          be visible to other people using the service; do not treat a post or uploaded file as a
          private message unless a feature clearly says it is private.
        </p>

        <h2>5. Marketplace and user-to-user interactions</h2>
        <p>
          If marketplace or other exchange features are available, provide truthful listings and do
          not post prohibited, stolen or misleading items. Users are responsible for evaluating and
          arranging their own transactions. Campus Connect does not guarantee a user's identity,
          the quality or availability of an item, payment, delivery, or the outcome of an interaction.
          Use appropriate caution when meeting or transacting with another person.
        </p>

        <h2>6. Reports, safety and enforcement</h2>
        <p>
          We may review content and account activity to protect users, enforce these Terms, respond
          to lawful requests, and maintain the service. Depending on the feature and severity, we may
          remove content, restrict functionality, suspend an account, or take other appropriate
          action. Reporting, blocking, muting and other controls may be introduced or improved over
          time; the absence of a particular control does not make abusive conduct acceptable.
        </p>

        <h2>7. Availability and changes</h2>
        <p>
          Campus Connect is under active development. Features may be incomplete, changed, paused or
          discontinued, and temporary interruptions can occur. We will take reasonable care but do
          not promise uninterrupted or error-free service. We may update these Terms as the service
          changes; when the wording changes materially, we will update the version date shown here.
        </p>

        <h2>8. Suspension or ending use</h2>
        <p>
          You may stop using Campus Connect at any time. We may suspend or terminate access where
          necessary to address serious or repeated violations, protect people or systems, comply with
          law, or maintain the service. Where account deletion or data-export controls are not yet
          available in the app, the official support contact must be provided by the service operator
          before public launch so users can make privacy-related requests.
        </p>

        <h2>9. Questions</h2>
        <p>
          An official Campus Connect support contact should be published by the service operator
          before public launch. These Terms are a product-use document and are not a substitute for
          advice from a qualified legal professional.
        </p>
      </div>
    </main>
  );
}
