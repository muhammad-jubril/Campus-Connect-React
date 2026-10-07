import { createContext, useCallback, useEffect, useRef, useState } from "react";
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
  const [peopleOwnerId, setPeopleOwnerId] = useState(null);
  const fetchingRef = useRef(new Set());
  const cacheEpochRef = useRef(0);
  const lastUserIdRef = useRef(null);
  const peopleOwnerIdRef = useRef(null);
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id || null;

  if (lastUserIdRef.current !== currentUserId) {
    lastUserIdRef.current = currentUserId;
    cacheEpochRef.current += 1;
  }

  useEffect(() => {
    if (peopleOwnerIdRef.current !== currentUserId) {
      setPeople({});
      setPeopleOwnerId(null);
      peopleOwnerIdRef.current = null;
    }
    fetchingRef.current.clear();
  }, [currentUserId]);

  const warmPeople = useCallback(async (usernames) => {
    const requestEpoch = cacheEpochRef.current;
    const requestUserId = currentUserId;
    const cacheIsCurrent = peopleOwnerId === requestUserId;
    const cachedPeople = cacheIsCurrent ? people : {};
    const missing = [...new Set(usernames)].filter(
      (u) => u && !cachedPeople[u] && !fetchingRef.current.has(u) && !(currentUser && u === currentUser.username)
    );
    if (missing.length === 0) return;
    missing.forEach((u) => fetchingRef.current.add(u));

    const { data, error } = await supabase.from("profiles").select("*").in("username", missing);
    if (!error && data && cacheEpochRef.current === requestEpoch && lastUserIdRef.current === requestUserId) {
      setPeople((prev) => {
        const next = { ...prev };
        data.forEach((row) => { next[row.username] = personFromProfileRow(row); });
        return next;
      });
      setPeopleOwnerId(requestUserId);
      peopleOwnerIdRef.current = requestUserId;
    }
    missing.forEach((u) => fetchingRef.current.delete(u));
  }, [people, peopleOwnerId, currentUser, currentUserId]);

  const getPerson = useCallback((username) => {
    if (currentUser && username === currentUser.username) return currentUser;
    if (peopleOwnerId !== currentUserId) return PLACEHOLDER(username);
    return people[username] || PLACEHOLDER(username);
  }, [people, peopleOwnerId, currentUser, currentUserId]);

  return (
    <PeopleContext.Provider value={{ getPerson, warmPeople }}>
      {children}
    </PeopleContext.Provider>
  );
}
