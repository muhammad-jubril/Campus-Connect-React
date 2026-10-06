const FRIENDLY_MESSAGES = {
  otp_expired: "That link has expired.",
};

export function readAuthUrlError() {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash;
  if (!hash || hash.length <= 1) return null;

  const params = new URLSearchParams(hash.slice(1));
  const code = params.get("error_code") || "";
  const description = params.get("error_description") || "";

  if (!code && !description) return null;

  return {
    code,
    message: FRIENDLY_MESSAGES[code] || "This reset link is invalid or has expired.",
  };
}

export function cleanAuthUrlErrorHash() {
  if (typeof window === "undefined" || !window.location.hash) return;

  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${window.location.search}`
  );
}
