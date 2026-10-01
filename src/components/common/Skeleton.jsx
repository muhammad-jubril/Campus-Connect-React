export default function FeedSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-row">
            <div className="sk sk-avatar" />
            <div style={{ flex: 1 }}>
              <div className="sk sk-line" style={{ width: "40%", marginBottom: 6 }} />
              <div className="sk sk-line" style={{ width: "25%", height: 8 }} />
            </div>
          </div>
          <div className="sk sk-line" style={{ width: "90%", marginBottom: 6 }} />
          <div className="sk sk-line" style={{ width: "60%" }} />
        </div>
      ))}
    </>
  );
}
