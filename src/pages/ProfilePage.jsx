
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import FeedSkeleton from "../components/common/Skeleton";
import PostCard from "../components/feed/PostCard";
import ContentSafetyMenu from "../components/safety/ContentSafetyMenu";
import MobileMenuButton from "../components/layout/MobileMenuButton";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { useToast } from "../hooks/useToast";
import {
  getProfileByUsername,
  personFromProfileRow,
} from "../services/supabase/profiles";
import { followUser, getFollowStatus, unfollowUser } from "../services/supabase/follows";

export default function ProfilePage() {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { posts, postsError, loadPostsByAuthor } = usePosts();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const isOwnProfile = !username || username === currentUser?.username;

  const [person, setPerson] = useState(isOwnProfile ? currentUser : null);
  const [notFound, setNotFound] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(!isOwnProfile);
  const [profileRetryCount, setProfileRetryCount] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollowStatus, setLoadingFollowStatus] = useState(false);
  const [followStatusError, setFollowStatusError] = useState(false);
  const [followWorking, setFollowWorking] = useState(false);
  const [followRetryKey, setFollowRetryKey] = useState(0);

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

    loadProfileAndPosts();

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

    if (isOwnProfile || !currentUser?.id || !person?.id) {
      setIsFollowing(false);
      setLoadingFollowStatus(false);
      setFollowStatusError(false);
      return () => { active = false; };
    }

    setLoadingFollowStatus(true);
    setFollowStatusError(false);
    getFollowStatus(currentUser.id, person.id)
      .then((following) => { if (active) setIsFollowing(following); })
      .catch((error) => {
        console.error("Could not load follow status:", error);
        if (active) setFollowStatusError(true);
      })
      .finally(() => { if (active) setLoadingFollowStatus(false); });

    return () => { active = false; };
  }, [isOwnProfile, currentUser?.id, person?.id, followRetryKey]);

  async function handleFollowToggle() {
    if (!currentUser?.id || !person?.id || isOwnProfile || followWorking || loadingFollowStatus || followStatusError) return;
    setFollowWorking(true);
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.id, person.id);
        setIsFollowing(false);
        showToast(`Unfollowed @${person.username}`);
      } else {
        await followUser(person.id);
        setIsFollowing(true);
        showToast(`Following @${person.username}`);
      }
    } catch (error) {
      console.error("Follow relationship update failed:", error);
      showToast(error?.message || "Couldn't update follow status. Try again.", "error");
    } finally {
      setFollowWorking(false);
    }
  }

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

              {isOwnProfile && (
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
              )}
              {!isOwnProfile && (
                <ContentSafetyMenu
                  targetType="account"
                  targetId={person.id}
                  reportedUserId={person.id}
                  targetAuthorId={person.id}
                  targetUsername={person.username}
                  targetLabel="account"
                />
              )}
            </div>

            {person.bio && (
              <p className="profile-card-bio">{person.bio}</p>
            )}

            <div className="profile-card-meta">
              {person.department || "Department not set"}
              {person.level ? ` · ${person.level} Level` : ""}
            </div>

            {!isOwnProfile && (
              followStatusError ? (
                <div className="profile-follow-error" role="alert">
                  <span>Couldn’t check follow status.</span>
                  <button type="button" className="btn btn-ghost" style={{ width: "auto" }} onClick={() => setFollowRetryKey((key) => key + 1)}>Try again</button>
                </div>
              ) : (
                <button
                  type="button"
                  className={`profile-edit-btn profile-follow-btn${isFollowing ? " is-following" : ""}`}
                  onClick={handleFollowToggle}
                  disabled={loadingFollowStatus || followWorking || !currentUser?.id}
                  aria-pressed={isFollowing}
                >
                  {loadingFollowStatus ? "Checking…" : followWorking ? (isFollowing ? "Unfollowing…" : "Following…") : isFollowing ? "Following · Unfollow" : "Follow"}
                </button>
              )
            )}

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

      <div className="profile-stats">
        <div>
          <strong>{theirPosts.length}</strong>
          <span>Posts</span>
        </div>
        <div>
          <strong>NWU</strong>
          <span>Campus</span>
        </div>
        <div>
          <strong>{person.level || "—"}</strong>
          <span>Level</span>
        </div>
      </div>

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
