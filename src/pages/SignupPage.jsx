import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import StepIndicator from "../components/auth/StepIndicator";
import SignupForm from "../components/auth/SignupForm";
import EmailVerification from "../components/auth/EmailVerification";
import ProfileSetup from "../components/auth/ProfileSetup";
import { useAuth } from "../hooks/useAuth";

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({ username: "", password: "", email: "" });
  const navigate = useNavigate();
  const { completeSignIn } = useAuth();

  return (
    <AuthLayout>
      <StepIndicator current={step} />
      {step === 1 && (
        <SignupForm
          initialUsername={data.username}
          initialPassword={data.password}
          onBack={() => navigate("/")}
          onNext={(username, password) => { setData((d) => ({ ...d, username, password })); setStep(2); }}
        />
      )}
      {step === 2 && (
        <EmailVerification
          username={data.username}
          password={data.password}
          onBack={() => setStep(1)}
          onNext={(email) => { setData((d) => ({ ...d, email })); setStep(3); }}
        />
      )}
      {step === 3 && (
        <ProfileSetup
          username={data.username}
          email={data.email}
          onBack={() => setStep(2)}
          onComplete={(profileRow) => { completeSignIn(profileRow); navigate("/welcome"); }}
        />
      )}
    </AuthLayout>
  );
}
