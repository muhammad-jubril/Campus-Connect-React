// Pure presentation — LoaderContext owns the state (show/success/text),
// this just renders it. The dual-ring spinner + drawn checkmark is the
// real branded loader from the vanilla build, not a generic spinner.
export default function Loader({ show, success, text }) {
  return (
    <div className={`loader-overlay ${show ? "show" : ""} ${success ? "success" : ""}`}>
      <div className="loader-mark">
        <svg viewBox="0 0 80 80" width="72" height="72">
          <circle className="ring ring-outer" cx="40" cy="40" r="30" />
          <circle className="ring ring-inner" cx="40" cy="40" r="22" />
          <circle className="ring-dot" cx="40" cy="10" r="3" />
        </svg>
        <div className="loader-check">
          <svg viewBox="0 0 46 46" width="46" height="46">
            <circle className="loader-check-circle" cx="23" cy="23" r="21" />
            <path className="loader-check-path" d="M13 23l7 7 13-13" />
          </svg>
        </div>
      </div>
      <div className="loader-text">{text}</div>
    </div>
  );
}
