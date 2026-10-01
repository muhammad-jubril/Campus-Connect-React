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

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={`toast ${toast.type} ${toast.show ? "show" : ""}`}>{toast.text}</div>
    </ToastContext.Provider>
  );
}
