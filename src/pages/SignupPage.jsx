import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/legal-consent.css";
import AuthLayout from "../components/auth/AuthLayout";
import StepIndicator from "../components/auth/StepIndicator";
import SignupForm from "../components/auth/SignupForm";
import EmailVerification from "../components/auth/EmailVerification";
import ProfileSetup from "../components/auth/ProfileSetup";
import EmailVerificationFinal from "../components/auth/EmailVerificationFinal";
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    username: "",
    password: "",
    email: "",
    profileData: null,
    termsAccepted: false,
    verificationStarted: false,
  });
  const navigate = useNavigate();
  const { completeSignIn } = useAuth();

  return (
    <AuthLayout>
      <StepIndicator current={step} />

      {step === 1 && (
        <SignupForm
          initialUsername={data.username}
          initialPassword={data.password}
          initialTermsAccepted={data.termsAccepted}
          onBack={() => navigate("/")}
          onNext={(username, password, termsAccepted) => {
            setData((current) => ({ ...current, username, password, termsAccepted }));
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <EmailVerification
          initialEmail={data.email}
          onBack={() => setStep(1)}
          onNext={(email) => {
            setData((current) => ({ ...current, email }));
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <ProfileSetup
          initialProfileData={data.profileData}
          onBack={() => setStep(2)}
          onNext={(profileData) => {
            setData((current) => ({ ...current, profileData }));
            setStep(4);
          }}
        />
      )}

      {step === 4 && (
        <EmailVerificationFinal
          username={data.username}
          password={data.password}
          email={data.email}
          profileData={data.profileData}
          termsAccepted={data.termsAccepted}
          initialShowOtp={data.verificationStarted}
          onVerificationStarted={() =>
            setData((current) => ({ ...current, verificationStarted: true }))
          }
          onBack={() => setStep(3)}
          onComplete={(profileRow) => {
            completeSignIn(profileRow);
            navigate("/welcome");
          }}
        />
      )}
    </AuthLayout>
  );
}
