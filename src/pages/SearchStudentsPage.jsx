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
  const requestIdRef = useRef(0);
  const { currentUser } = useAuth();

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      requestIdRef.current += 1;
      setLoading(false);
      setSearched(false);
      setResults([]);
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setSearched(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(20);

      if (requestId !== requestIdRef.current) return;

      if (error || !data || data.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const people = data
        .slice()
        .sort((a, b) => String(a.name || a.username).localeCompare(String(b.name || b.username)))
        .map(personFromProfileRow);

      setResults(people);
      setLoading(false);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query]);

  return (
    <div className="search-page explore-page">
      <div className="search-page-heading explore-page-heading">
        <span className="eyebrow">DISCOVER CAMPUS</span>
        <h2 className="display">Explore</h2>
        <p className="subtitle">Find students and discover what’s happening around campus.</p>
      </div>

      <div className="search-input-wrap explore-search-input-wrap">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search students by name or username"
          autoComplete="off"
          aria-label="Search students by name or username"
        />
      </div>

      <div className="student-search-results">
        {results.map((person) => (
          <Link
            key={person.id || person.username}
            className="search-result-row"
            to={person.username === currentUser?.username ? "/profile" : `/profile/${encodeURIComponent(person.username)}`}
          >
            <Avatar person={person} size="sm" />
            <span className="search-result-info">
              <span className="search-result-name">{person.name || person.username}</span>
              <span className="search-result-username">@{person.username}</span>
            </span>
            <span className="search-result-arrow" aria-hidden="true">→</span>
          </Link>
        ))}
      </div>

      {loading && <div className="search-state search-status">Searching students…</div>}

      {!loading && searched && results.length === 0 && (
        <div className="search-state search-empty">
          <p className="subtitle" style={{ marginBottom: 0 }}>No students found.</p>
          <p className="subtitle" style={{ marginBottom: 0 }}>Try another name or username.</p>
        </div>
      )}

      {!searched && (
        <section className="explore-trending-section" aria-labelledby="explore-trending-title">
          <div className="explore-trending-heading">
            <div>
              <span className="eyebrow">CAMPUS DISCOVERY</span>
              <h3 id="explore-trending-title" className="display">Trending on campus</h3>
            </div>
            <span className="explore-coming-soon">Coming soon</span>
          </div>
          <div className="explore-trending-card">
            <span className="explore-trending-mark" aria-hidden="true">↗</span>
            <div>
              <h4>What’s happening at NWU?</h4>
              <p>Trending topics and popular conversations will appear here when real campus activity data is connected.</p>
            </div>
          </div>
        </section>
      )}

      {searched && !loading && (
        <section className="explore-trending-section explore-trending-secondary" aria-labelledby="explore-trending-title-after-search">
          <div className="explore-trending-heading">
            <div>
              <span className="eyebrow">CAMPUS DISCOVERY</span>
              <h3 id="explore-trending-title-after-search" className="display">Trending on campus</h3>
            </div>
            <span className="explore-coming-soon">Coming soon</span>
          </div>
          <p className="explore-trending-note">Real campus trends will appear here once activity data is available.</p>
        </section>
      )}
    </div>
  );
}
