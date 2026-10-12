import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import { useAuth } from "../hooks/useAuth";
import { getProfileByUsername, personFromProfileRow } from "../services/supabase/profiles";
import { getProfileConnectionPage } from "../services/supabase/profileFollows";
import "../styles/profile-following.css";

const PAGE_SIZE = 30;

function connectionErrorMessage(error) {
  return error?.message || "Couldn't load this list. Check your connection and try again.";
}

function emptyListState(connectionType, owner) {
  if (connectionType === "followers") {
    return owner?.id ? "No visible followers yet." : "No followers yet.";
  }
  return owner?.id ? "This student isn't following anyone yet." : "No accounts to show yet.";
}

export default function ProfileConnectionsPage() {
  const { username, connectionType } = useParams();
  const { currentUser } = useAuth();
  const isFollowers = connectionType === "followers";
  const isValidType = isFollowers || connectionType === "following";
  const [retryCount, setRetryCount] = useState(0);
  const [pageState, setPageState] = useState({
    status: "loading",
    owner: null,
    people: [],
    count: 0,
    nextOffset: 0,
    hasMore: false,
    error: "",
    loadingMore: false,
    loadMoreError: "",
  });
  const routeGenerationRef = useRef(0);
  const loadMoreOperationRef = useRef(0);
  const loadMoreLockRef = useRef(false);

  useEffect(() => {
    let active = true;
    const generation = ++routeGenerationRef.current;
    loadMoreOperationRef.current += 1;
    loadMoreLockRef.current = false;

    setPageState({
      status: "loading",
      owner: null,
      people: [],
      count: 0,
      nextOffset: 0,
      hasMore: false,
      error: "",
      loadingMore: false,
      loadMoreError: "",
    });

    async function loadInitialPage() {
      try {
        if (!isValidType) throw new Error("Choose either followers or following.");
        if (!username) throw new Error("This student profile couldn't be identified.");

        let owner;
        if (username === currentUser?.username && currentUser?.id) {
          owner = currentUser;
        } else {
          const result = await getProfileByUsername(username);
          if (result?.error || !result?.profile) {
            throw new Error("This profile isn't available. It may have been removed or isn't visible to your account.");
          }
          owner = personFromProfileRow(result.profile);
        }

        if (!owner?.id) throw new Error("This profile isn't available.");
        if (active && routeGenerationRef.current === generation) {
          setPageState((previous) => ({ ...previous, owner }));
        }

        const result = await getProfileConnectionPage(owner.id, currentUser?.id, connectionType, {
          offset: 0,
          limit: PAGE_SIZE,
        });

        if (active && routeGenerationRef.current === generation) {
          setPageState({
            status: "ready",
            owner,
            people: result.people,
            count: result.count,
            nextOffset: result.nextOffset,
            hasMore: result.hasMore,
            error: "",
            loadingMore: false,
            loadMoreError: "",
          });
        }
      } catch (error) {
        if (!active || routeGenerationRef.current !== generation) return;
        console.error("Profile connections failed to load:", error);
        setPageState((previous) => ({
          ...previous,
          status: "error",
          error: connectionErrorMessage(error),
          loadingMore: false,
        }));
      }
    }

    void loadInitialPage();

    return () => {
      active = false;
      if (routeGenerationRef.current === generation) routeGenerationRef.current += 1;
      loadMoreOperationRef.current += 1;
      loadMoreLockRef.current = false;
    };
  }, [username, connectionType, currentUser?.id, currentUser?.username, retryCount, isValidType]);

  async function handleLoadMore() {
    if (
      loadMoreLockRef.current ||
      pageState.status !== "ready" ||
      !pageState.hasMore ||
      !pageState.owner?.id ||
      !currentUser?.id
    ) return;

    loadMoreLockRef.current = true;
    const generation = routeGenerationRef.current;
    const operation = ++loadMoreOperationRef.current;
    const offset = pageState.nextOffset;
    const ownerId = pageState.owner.id;

    setPageState((previous) => ({ ...previous, loadingMore: true, loadMoreError: "" }));

    try {
      const result = await getProfileConnectionPage(ownerId, currentUser.id, connectionType, {
        offset,
        limit: PAGE_SIZE,
      });

      if (routeGenerationRef.current !== generation || loadMoreOperationRef.current !== operation) return;

      setPageState((previous) => {
        const existingIds = new Set(previous.people.map((person) => person.id));
        const newPeople = result.people.filter((person) => !existingIds.has(person.id));
        return {
          ...previous,
          people: [...previous.people, ...newPeople],
          count: result.count,
          nextOffset: result.nextOffset,
          hasMore: result.hasMore,
          loadingMore: false,
          loadMoreError: "",
        };
      });
    } catch (error) {
      if (routeGenerationRef.current !== generation || loadMoreOperationRef.current !== operation) return;
      console.error("More profile connections failed to load:", error);
      setPageState((previous) => ({
        ...previous,
        loadingMore: false,
        loadMoreError: connectionErrorMessage(error),
      }));
    } finally {
      if (loadMoreOperationRef.current === operation) {
        loadMoreLockRef.current = false;
        setPageState((previous) => ({ ...previous, loadingMore: false }));
      }
    }
  }

  const pageTitle = isFollowers ? "Followers" : "Following";
  const explanatoryText = pageState.owner
    ? (isFollowers
      ? `Students who follow @${pageState.owner.username || username}.`
      : `Students @${pageState.owner.username || username} follows.`)
    : "Browse this student's campus connections.";

  return (
    <section className="profile-connections-page">
      <div className="profile-connections-heading">
        <span className="eyebrow">CAMPUS NETWORK</span>
        <h1 className="display">{pageTitle}</h1>
        <p className="subtitle">{explanatoryText}</p>
      </div>

      {pageState.status === "loading" ? (
        <div className="profile-connections-state" role="status" aria-live="polite">
          Loading {pageTitle.toLowerCase()}…
        </div>
      ) : pageState.status === "error" ? (
        <div className="profile-connections-state" role="alert">
          <p>{pageState.error}</p>
          <button type="button" className="btn btn-primary" onClick={() => setRetryCount((count) => count + 1)}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="profile-connections-summary">
            <span>{new Intl.NumberFormat().format(pageState.count)} {pageState.count === 1 ? "student" : "students"}</span>
          </div>

          {pageState.people.length === 0 ? (
            <div className="profile-connections-state">
              <div className="empty-state-icon" aria-hidden="true">↗</div>
              <p className="subtitle">{emptyListState(connectionType, pageState.owner)}</p>
            </div>
          ) : (
            <div className="profile-connection-list">
              {pageState.people.map((person) => (
                <Link
                  key={person.id}
                  className="search-result-row profile-connection-row"
                  to={person.username === currentUser?.username
                    ? "/profile"
                    : `/profile/${encodeURIComponent(person.username)}`}
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
          )}

          {pageState.loadMoreError && (
            <div className="profile-connections-inline-error" role="alert">
              <span>{pageState.loadMoreError}</span>
              <button type="button" className="btn btn-ghost" onClick={handleLoadMore}>Retry</button>
            </div>
          )}

          {pageState.hasMore && (
            <button
              type="button"
              className="btn btn-ghost profile-connections-load-more"
              onClick={handleLoadMore}
              disabled={pageState.loadingMore}
            >
              {pageState.loadingMore ? "Loading more…" : "Load more"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
