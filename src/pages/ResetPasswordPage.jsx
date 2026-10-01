import AuthLayout from "../components/auth/AuthLayout";
import ResetPassword from "../components/auth/ResetPassword";

// Only reachable directly if someone navigates here manually — the normal
// path is AppRoutes rendering <ResetPassword/> automatically the instant
// AuthContext detects the PASSWORD_RECOVERY event, regardless of URL.
export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPassword />
    </AuthLayout>
  );
}
