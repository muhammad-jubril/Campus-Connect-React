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
    <div className="search-page">
      <div className="search-page-heading">
        <h2 className="display">Search students</h2>
        <p className="subtitle">Find students by name or @username.</p>
      </div>

      <div className="search-input-wrap">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or username"
          autoComplete="off"
          aria-label="Search students"
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

      {!loading && !searched && (
        <div className="search-state search-empty">
          <div className="empty-state-icon">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          </div>
          <p className="subtitle" style={{ marginBottom: 0, maxWidth: 260 }}>Find other NWU students by their name or @username.</p>
        </div>
      )}
    </div>
  );
}
