let loggedStorageError = false;

function logStorageErrorOnce(error) {
  if (!import.meta.env.DEV || loggedStorageError || !error) return;
  loggedStorageError = true;
  console.log("Campus Connect Supabase storage error:", error);
}

export function getUploadErrorMessage(error, kind = "post") {
  if (!error) return null;
  logStorageErrorOnce(error);

  const code = typeof error.code === "string" ? error.code : "";
  const nestedCode = typeof error.error === "string" ? error.error : "";
  const status = Number(error.statusCode ?? error.status ?? error.httpStatusCode);

  if (
    code === "EntityTooLarge" ||
    status === 413 ||
    nestedCode === "Payload too large"
  ) {
    return kind === "avatar"
      ? "That photo is too large (max 2 MB)"
      : "That file is too large (max 50 MB)";
  }

  if (
    code === "InvalidMimeType" ||
    status === 415 ||
    nestedCode === "invalid_mime_type"
  ) {
    return "That file type isn't supported";
  }

  return null;
}
