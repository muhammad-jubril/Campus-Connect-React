import { createContext, useCallback, useRef, useState } from "react";

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({ text: "", type: "success", show: false });
  const timerRef = useRef(null);

  const showToast = useCallback((text, type = "success") => {
    clearTimeout(timerRef.current);
    setToast({ text, type, show: true });
    timerRef.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  }, []);

  const isError = toast.type === "error";

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`toast ${toast.type} ${toast.show ? "show" : ""}`}
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {toast.text}
      </div>
    </ToastContext.Provider>
  );
}
