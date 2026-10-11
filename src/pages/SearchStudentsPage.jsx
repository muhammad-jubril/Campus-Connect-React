
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../services/supabase/client";
import { personFromProfileRow } from "../services/supabase/profiles";

export default function SearchStudentsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const requestIdRef = useRef(0);
  const { currentUser } = useAuth();

  useEffect(() => {
    const term = query.trim();
    const requestId = ++requestIdRef.current;

    if (!term) {
      setLoading(false);
      setSearched(false);
      setSearchError(false);
      setResults([]);
      return undefined;
    }

    setLoading(true);
    setSearched(true);
    setSearchError(false);

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .or(`username.ilike.%${term}%,name.ilike.%${term}%`)
          .limit(20);

        // Ignore results from an outdated query.
        if (requestId !== requestIdRef.current) return;

        if (error || !data) {
          if (error) {
            console.error("Student search failed:", error);
          }

          setResults([]);
          setSearchError(true);
          return;
        }

        if (data.length === 0) {
          setResults([]);
          setSearchError(false);
          return;
        }

        const people = data
          .slice()
          .sort((a, b) =>
            String(a.name || a.username).localeCompare(
              String(b.name || b.username)
            )
          )
          .map(personFromProfileRow);

        setResults(people);
        setSearchError(false);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;

        console.error("Student search failed:", error);
        setResults([]);
        setSearchError(true);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);

      // Invalidate any request still running when the query changes
      // or this component is unmounted.
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1;
      }
    };
  }, [query, retryCount]);

  function handleRetrySearch() {
    setResults([]);
    setSearchError(false);
    setLoading(true);
    setRetryCount((count) => count + 1);
  }

  return (
    <div className="search-page explore-page">
      <div className="search-page-heading">
        <span className="eyebrow">CAMPUS CONNECT</span>
        <h2 className="display">Explore</h2>
        <p className="subtitle">
          Find students and discover what’s happening around campus.
        </p>
      </div>

      <div className="search-input-wrap">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>

        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
          autoComplete="off"
          aria-label="Search students by name or username"
        />
      </div>

      <div className="student-search-results">
        {results.map((person) => (
          <Link
            key={person.id || person.username}
            className="search-result-row"
            to={
              person.username === currentUser?.username
                ? "/profile"
                : `/profile/${encodeURIComponent(person.username)}`
            }
          >
            <Avatar person={person} size="sm" />

            <span className="search-result-info">
              <span className="search-result-name">
                {person.name || person.username}
              </span>
              <span className="search-result-username">
                @{person.username}
              </span>
            </span>

            <span className="search-result-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>

      {loading && (
        <div className="search-state search-status" role="status">
          Searching students…
        </div>
      )}

      {!loading && searchError && (
        <div className="search-state search-empty" role="alert">
          <p className="subtitle" style={{ marginBottom: 0 }}>
            We couldn’t search students right now.
          </p>
          <p className="subtitle" style={{ marginBottom: 12 }}>
            Check your connection and try again.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "auto", padding: "10px 20px" }}
            onClick={handleRetrySearch}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !searchError && searched && results.length === 0 && (
        <div className="search-state search-empty">
          <p className="subtitle" style={{ marginBottom: 0 }}>
            No students found.
          </p>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            Try another name or username.
          </p>
        </div>
      )}

      {!loading && !searched && (
        <div className="search-state search-empty explore-search-hint">
          <div className="empty-state-icon">
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </div>
          <p className="subtitle" style={{ marginBottom: 0, maxWidth: 300 }}>
            Search by a student's name or @username to find their profile.
          </p>
        </div>
      )}

      <section
        className="explore-trending-section"
        aria-labelledby="explore-trending-title"
      >
        <div className="explore-trending-heading">
          <span className="eyebrow">CAMPUS DISCOVERY</span>
          <h3 id="explore-trending-title" className="display">
            Trending on campus
          </h3>
        </div>

        <div className="explore-trending-card">
          <span className="desktop-panel-coming-soon">Coming soon</span>
          <p>
            Trending topics will appear here once campus activity data is
            connected.
          </p>
        </div>
      </section>
    </div>
  );
}
