import { useEffect, useState } from "react";
import AuthLayout from "../components/auth/AuthLayout";
import ResetLinkExpired from "../components/auth/ResetLinkExpired";
import { cleanAuthUrlErrorHash, readAuthUrlError } from "../utils/authUrlErrors";

// AppRoutes owns the real reset form when Supabase emits PASSWORD_RECOVERY.
// This route is only reached without a recovery session, so it is the safe
// landing screen for direct visits and expired/used links.
export default function ResetPasswordPage() {
  const [urlError, setUrlError] = useState(null);

  useEffect(() => {
    const nextError = readAuthUrlError();
    if (nextError) setUrlError(nextError);
    cleanAuthUrlErrorHash();
  }, []);

  return (
    <AuthLayout>
      <ResetLinkExpired detail={urlError?.message} />
    </AuthLayout>
  );
}
