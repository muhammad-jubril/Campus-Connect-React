import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function Fab() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);

  const visibleTab = location.pathname === "/feed" || location.pathname === "/profile";

  useEffect(() => {
    const scrollContainer = document.getElementById("app-content-main");
    if (!scrollContainer) return undefined;

    lastScrollTop.current = scrollContainer.scrollTop || 0;

    const onScroll = () => {
      const top = Math.max(0, scrollContainer.scrollTop);
      const delta = top - lastScrollTop.current;

      if (top <= 8) {
        setHidden(false);
      } else if (delta > 1) {
        setHidden(true);
      } else if (delta < -1) {
        setHidden(false);
      }

      // Keep the current visibility when scrolling settles at the same offset.
      lastScrollTop.current = top;
    };

    scrollContainer.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollContainer.removeEventListener("scroll", onScroll);
  }, [location.pathname]);

  useEffect(() => {
    setHidden(false);
    lastScrollTop.current = 0;
  }, [location.pathname]);

  if (!visibleTab) return null;

  return (
    <button
      type="button"
      className={`fab-create ${hidden ? "fab-hidden" : ""}`}
      onClick={() => navigate("/create")}
      aria-label="Create post"
    >
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  );
}
