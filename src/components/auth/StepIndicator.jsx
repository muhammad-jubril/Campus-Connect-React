const STEP_LABELS = ["Account", "Email", "Profile", "Verify"];

export default function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {[1, 2, 3, 4].map((i) => {
        const state = i < current ? "completed" : i === current ? "current" : "upcoming";
        return (
          <div key={i} style={{ display: "contents" }}>
            <div className={`step-node ${state}`}>
              <div className="step-circle">
                {state === "completed" ? (
                  <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="m9.5 16.2-3.5-3.5L4.6 14l4.9 4.9L20 8.4l-1.4-1.4z" /></svg>
                ) : state === "current" ? (
                  <span className="step-dot" />
                ) : i}
              </div>
              <div className="step-label">{STEP_LABELS[i - 1]}</div>
            </div>
            {i < 4 && <div className={`step-line ${i < current ? "completed" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}
