import { useNavigate } from "react-router-dom";

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="M15.5 4.5 8 12l7.5 7.5 1.4-1.4L10.8 12l6.1-6.1z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="currentColor" d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4z" />
    <path fill="currentColor" d="M18.6 5 6 17.6l-1.4-1.4L17.2 3.6z" />
  </svg>
);

export default function ScreenLayout({ children, close = false, flex = false }) {
  const navigate = useNavigate();

  return (
    <main className="screen-page">
      <button
        type="button"
        className="btn-back screen-page-back"
        onClick={() => navigate(-1)}
        aria-label={close ? "Close" : "Go back"}
      >
        {close ? <CloseIcon /> : <BackIcon />}
      </button>
      <div className={`screen-page-inner${flex ? " screen-page-inner-flex" : ""}`}>
        {children}
      </div>
    </main>
  );
}
