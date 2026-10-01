import { createContext, useCallback, useRef, useState } from "react";
import { supabase } from "../services/supabase/client";
import { personFromProfileRow } from "../services/supabase/profiles";
import { useAuth } from "../hooks/useAuth";

export const PeopleContext = createContext(null);

const PLACEHOLDER = (username) => ({ username, name: "Loading…", faculty: "", department: "", level: "", avatarDataUrl: "", tone: 0 });

// A shared, deduped cache of "other people's" profile info (name, avatar,
// department...) — post cards, comments, and profile views all need this
// for whoever authored the thing they're showing, without every card
// firing its own redundant fetch for the same person.
export function PeopleProvider({ children }) {
  const [people, setPeople] = useState({});
  const fetchingRef = useRef(new Set());
  const { currentUser } = useAuth();

  const warmPeople = useCallback(async (usernames) => {
    const missing = [...new Set(usernames)].filter(
      (u) => u && !people[u] && !fetchingRef.current.has(u) && !(currentUser && u === currentUser.username)
    );
    if (missing.length === 0) return;
    missing.forEach((u) => fetchingRef.current.add(u));

    const { data, error } = await supabase.from("profiles").select("*").in("username", missing);
    if (!error && data) {
      setPeople((prev) => {
        const next = { ...prev };
        data.forEach((row) => { next[row.username] = personFromProfileRow(row); });
        return next;
      });
    }
    missing.forEach((u) => fetchingRef.current.delete(u));
  }, [people, currentUser]);

  const getPerson = useCallback((username) => {
    if (currentUser && username === currentUser.username) return currentUser;
    return people[username] || PLACEHOLDER(username);
  }, [people, currentUser]);

  return (
    <PeopleContext.Provider value={{ getPerson, warmPeople }}>
      {children}
    </PeopleContext.Provider>
  );
}
