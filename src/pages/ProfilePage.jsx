import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import FeedSkeleton from "../components/common/Skeleton";
import PostCard from "../components/feed/PostCard";
import ContentSafetyMenu from "../components/safety/ContentSafetyMenu";
import MobileMenuButton from "../components/layout/MobileMenuButton";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import {
  getProfileByUsername,
  personFromProfileRow,
} from "../services/supabase/profiles";
import {
  followStudent,
  getProfileFollowSummary,
  unfollowStudent,
} from "../services/supabase/profileFollows";
import "../styles/profile-following.css";

function formatCount(value) {
  return new Intl.NumberFormat().format(value);
}

export default function ProfilePage() {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { posts, postsError, loadPostsByAuthor } = usePosts();
  const navigate = useNavigate();
  const isOwnProfile = !username || username === currentUser?.username;

  const [person, setPerson] = useState(isOwnProfile ? currentUser : null);
  const [notFound, setNotFound] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(!isOwnProfile);
  const [profileRetryCount, setProfileRetryCount] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [followSummary, setFollowSummary] = useState({
    profileId: null,
    status: "idle",
    value: null,
    error: "",
  });
  const [followSummaryRetry, setFollowSummaryRetry] = useState(0);
  const [followActionBusy, setFollowActionBusy] = useState(false);
  const [followActionError, setFollowActionError] = useState("");
  const followActionLockRef = useRef(false);
  const followSummaryRequestRef = useRef(0);

  useEffect(() => {
    let active = true;

    async function loadProfileAndPosts() {
      setLoadingPosts(true);
      setNotFound(false);
      setProfileError(false);

      if (isOwnProfile) {
        setLoadingProfile(false);
        setPerson(currentUser);

        if (!currentUser?.id) {
          if (active) setLoadingPosts(false);
          return;
        }

        await loadPostsByAuthor(currentUser.id);

        if (active) setLoadingPosts(false);
        return;
      }

      setPerson(null);
      setLoadingProfile(true);

      let result;

      try {
        result = await getProfileByUsername(username);
      } catch (loadError) {
        if (!active) return;

        console.error("Failed to load student profile:", loadError);
        setProfileError(true);
        setLoadingProfile(false);
        setLoadingPosts(false);
        return;
      }

      if (!active) return;

      const { profile, error } = result || {};

      // The profile helper uses .single(). A genuine missing row can
      // therefore arrive as PGRST116 with details indicating zero rows.
      const isMissingProfile =
        !profile &&
        (
          !error ||
          (
            error.code === "PGRST116" &&
            /\b0 rows\b/i.test(error.details || "")
          )
        );

      if (isMissingProfile) {
        setNotFound(true);
        setLoadingProfile(false);
        setLoadingPosts(false);
        return;
      }

      // Do not label database, network, or unexpected lookup failures
      // as a missing student.
      if (error || !profile) {
        if (error) {
          console.error("Failed to load student profile:", error);
        }

        setProfileError(true);
        setLoadingProfile(false);
        setLoadingPosts(false);
        return;
      }

      const nextPerson = personFromProfileRow(profile);
      setPerson(nextPerson);
      setLoadingProfile(false);

      await loadPostsByAuthor(profile.id);

      if (active) setLoadingPosts(false);
    }

    void loadProfileAndPosts();

    return () => {
      active = false;
    };
  }, [
    username,
    isOwnProfile,
    currentUser,
    loadPostsByAuthor,
    profileRetryCount,
  ]);

  useEffect(() => {
    let active = true;
    const requestId = ++followSummaryRequestRef.current;

    if (!person?.id || !currentUser?.id) {
      setFollowSummary({ profileId: person?.id || null, status: "idle", value: null, error: "" });
      return () => { active = false; };
    }

    setFollowSummary({ profileId: person.id, status: "loading", value: null, error: "" });
    setFollowActionError("");

    getProfileFollowSummary(person.id, currentUser.id)
      .then((value) => {
        if (active && requestId === followSummaryRequestRef.current) {
          setFollowSummary({ profileId: person.id, status: "ready", value, error: "" });
        }
      })
      .catch((error) => {
        if (active && requestId === followSummaryRequestRef.current) {
          console.error("Profile follow summary failed:", error);
          setFollowSummary({
            profileId: person.id,
            status: "error",
            value: null,
            error: error.message || "Couldn't load followers and following.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [person?.id, currentUser?.id, followSummaryRetry]);

  function handleRetryProfile() {
    setLoadingProfile(true);
    setProfileError(false);
    setNotFound(false);
    setProfileRetryCount((count) => count + 1);
  }

  async function handleRetryPosts() {
    if (!person?.id) return;

    setLoadingPosts(true);
    await loadPostsByAuthor(person.id, true);
    setLoadingPosts(false);
  }

  async function handleToggleFollow() {
    if (
      followActionLockRef.current ||
      isOwnProfile ||
      !currentUser?.id ||
      !person?.id ||
      followSummary.status !== "ready" ||
      !followSummary.value
    ) return;

    followActionLockRef.current = true;
    setFollowActionBusy(true);
    setFollowActionError("");

    const wasFollowing = followSummary.value.isFollowing;
    const nextIsFollowing = !wasFollowing;
    const profileId = person.id;
    const oldSummary = followSummary.value;

    try {
      if (nextIsFollowing) {
        await followStudent(currentUser.id, profileId);
      } else {
        await unfollowStudent(currentUser.id, profileId);
      }

      // Reflect the confirmed mutation immediately; then reconcile with exact
      // server counts so counts remain correct if another tab acted as well.
      setFollowSummary({
        profileId,
        status: "ready",
        value: {
          ...oldSummary,
          isFollowing: nextIsFollowing,
          followers: Math.max(0, oldSummary.followers + (nextIsFollowing ? 1 : -1)),
        },
        error: "",
      });

      try {
        const latest = await getProfileFollowSummary(profileId, currentUser.id);
        if (person?.id === profileId) {
          setFollowSummary({ profileId, status: "ready", value: latest, error: "" });
        }
      } catch (refreshError) {
        console.warn("Follow change succeeded but summary refresh failed:", refreshError);
        setFollowActionError("Your change was saved, but the counts couldn't be refreshed. Retry follow data below.");
      }
    } catch (error) {
      console.error("Follow change failed:", error);
      setFollowActionError(error.message || "Couldn't update this follow. Please try again.");
    } finally {
      followActionLockRef.current = false;
      setFollowActionBusy(false);
    }
  }

  function openConnectionList(connectionType) {
    const profileUsername = person?.username || currentUser?.username;
    if (!profileUsername) return;
    navigate(`/profile/${encodeURIComponent(profileUsername)}/${connectionType}`);
  }

  if (loadingProfile && !person) {
    return (
      <div className="profile-page">
        <div
          className="empty-state"
          style={{ paddingTop: 40 }}
          role="status"
          aria-live="polite"
        >
          <p className="subtitle" style={{ marginBottom: 0 }}>
            Loading student profile…
          </p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="profile-page">
        <h2 className="display">Student not found</h2>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="profile-page">
        <div
          className="empty-state"
          style={{ paddingTop: 40 }}
          role="alert"
        >
          <h2 className="display" style={{ marginBottom: 12 }}>
            Couldn’t load this profile
          </h2>

          <p
            className="subtitle"
            style={{ marginBottom: 14, maxWidth: 280 }}
          >
            We couldn’t load this student’s profile. Check your connection
            and try again.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "auto", padding: "10px 20px" }}
            onClick={handleRetryProfile}
            disabled={loadingProfile}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!person) return null;

  const theirPosts = posts.filter((post) => post.authorId === person.id);
  const currentFollowSummary = followSummary.profileId === person.id ? followSummary : null;
  const stats = currentFollowSummary?.status === "ready" ? currentFollowSummary.value : null;
  const followButtonLabel = followActionBusy
    ? "Updating…"
    : stats?.isFollowing
      ? "Following"
      : currentFollowSummary?.status === "loading"
        ? "Checking…"
        : "Follow";

  return (
    <div className="profile-page">
      {isOwnProfile && (
        <div className="profile-topbar">
          <MobileMenuButton />
          <span className="profile-topbar-spacer" aria-hidden="true" />
        </div>
      )}

      <div className="profile-card">
        <div className="profile-card-cover">
          <span className="profile-card-kicker">CAMPUS IDENTITY</span>
          <span className="profile-card-mark">NWU</span>
          <div className="profile-card-orbit" aria-hidden="true" />
        </div>

        <div className="profile-card-body">
          <div className="profile-card-avatar">
            <Avatar person={person} size="lg" />
          </div>

          <div className="profile-card-main">
            <div className="profile-card-heading">
              <div>
                <h2 className="display">{person.name}</h2>
                <p className="profile-card-username">@{person.username}</p>
              </div>

              {isOwnProfile ? (
                <button
                  type="button"
                  className="profile-edit-icon"
                  onClick={() => navigate("/profile/edit")}
                  aria-label="Edit profile"
                  title="Edit profile"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
                  </svg>
                </button>
              ) : (
                <div className="profile-card-actions">
                  <button
                    type="button"
                    className={`profile-follow-btn${stats?.isFollowing ? " is-following" : ""}`}
                    onClick={handleToggleFollow}
                    disabled={
                      followActionBusy ||
                      currentFollowSummary?.status !== "ready" ||
                      !currentFollowSummary?.value
                    }
                    aria-pressed={stats?.isFollowing === true}
                  >
                    {followButtonLabel}
                  </button>
                  <ContentSafetyMenu
                    targetType="account"
                    targetId={person.id}
                    reportedUserId={person.id}
                    targetAuthorId={person.id}
                    targetUsername={person.username}
                    targetLabel="account"
                  />
                </div>
              )}
            </div>

            {person.bio && (
              <p className="profile-card-bio">{person.bio}</p>
            )}

            <div className="profile-card-meta">
              {person.department || "Department not set"}
              {person.level ? ` · ${person.level} Level` : ""}
            </div>

            {isOwnProfile && (
              <button
                type="button"
                className="profile-edit-btn"
                onClick={() => navigate("/profile/edit")}
              >
                Edit profile
              </button>
            )}
            {isOwnProfile && (
              <button
                type="button"
                className="profile-edit-btn"
                onClick={() => navigate("/blocked-accounts")}
              >
                Blocked accounts
              </button>
            )}
          </div>
        </div>
      </div>

      {!isOwnProfile && followActionError && (
        <div className="profile-follow-inline-error" role="alert">
          <span>{followActionError}</span>
          {followActionError.includes("counts couldn't be refreshed") && (
            <button type="button" onClick={() => setFollowSummaryRetry((count) => count + 1)}>
              Retry follow data
            </button>
          )}
        </div>
      )}

      <div className="profile-stats" aria-label="Profile statistics">
        <div>
          <strong>{theirPosts.length}</strong>
          <span>Posts</span>
        </div>
        <button
          type="button"
          className="profile-stat-link"
          onClick={() => openConnectionList("followers")}
          aria-label={`View followers for ${person.name || person.username}`}
        >
          <strong>{stats ? formatCount(stats.followers) : currentFollowSummary?.status === "loading" ? "…" : "—"}</strong>
          <span>Followers</span>
        </button>
        <button
          type="button"
          className="profile-stat-link"
          onClick={() => openConnectionList("following")}
          aria-label={`View accounts ${person.name || person.username} follows`}
        >
          <strong>{stats ? formatCount(stats.following) : currentFollowSummary?.status === "loading" ? "…" : "—"}</strong>
          <span>Following</span>
        </button>
        <div>
          <strong>NWU</strong>
          <span>Campus</span>
        </div>
        <div>
          <strong>{person.level || "—"}</strong>
          <span>Level</span>
        </div>
      </div>

      {currentFollowSummary?.status === "error" && (
        <div className="profile-follow-inline-error" role="alert">
          <span>{currentFollowSummary.error}</span>
          <button type="button" onClick={() => setFollowSummaryRetry((count) => count + 1)}>
            Retry follow data
          </button>
        </div>
      )}

      <div className="profile-section-head">
        <h3 className="section-label">
          {isOwnProfile ? "Your posts" : "Posts"}
        </h3>
      </div>

      {loadingPosts ? (
        <FeedSkeleton />
      ) : postsError ? (
        <div
          className="empty-state"
          style={{ paddingTop: 24 }}
          role="alert"
        >
          <p
            className="subtitle"
            style={{ marginBottom: 14, maxWidth: 280 }}
          >
            We couldn’t load these posts. Check your connection and try again.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            style={{ width: "auto", padding: "10px 20px" }}
            onClick={handleRetryPosts}
          >
            Try again
          </button>
        </div>
      ) : theirPosts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {isOwnProfile ? "You haven't posted anything yet." : "No posts yet."}
          </p>

          {isOwnProfile && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ maxWidth: 240 }}
              onClick={() => navigate("/create")}
            >
              Create your first post
            </button>
          )}
        </div>
      ) : (
        theirPosts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
