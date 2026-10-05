import { useEffect, useState } from "react";
<<<<<<< HEAD
import { useParams, useNavigate } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import PostCard from "../components/feed/PostCard";
=======
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import PostCard from "../components/feed/PostCard";
import MobileMenuButton from "../components/layout/MobileMenuButton";
>>>>>>> 1322a16 (update)
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { getProfileByUsername, personFromProfileRow } from "../services/supabase/profiles";

export default function ProfilePage() {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { posts, loadPosts } = usePosts();
  const navigate = useNavigate();
<<<<<<< HEAD
  const isOwnProfile = !username || (currentUser && username === currentUser.username);
=======
  const isOwnProfile = !username || username === currentUser?.username;
>>>>>>> 1322a16 (update)

  const [person, setPerson] = useState(isOwnProfile ? currentUser : null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadPosts();
<<<<<<< HEAD
    if (isOwnProfile) { setPerson(currentUser); return; }
    getProfileByUsername(username).then(({ profile, error }) => {
      if (error || !profile) { setNotFound(true); return; }
=======
    if (isOwnProfile) {
      setPerson(currentUser);
      setNotFound(false);
      return;
    }

    setPerson(null);
    setNotFound(false);
    getProfileByUsername(username).then(({ profile, error }) => {
      if (error || !profile) {
        setNotFound(true);
        return;
      }
>>>>>>> 1322a16 (update)
      setPerson(personFromProfileRow(profile));
    });
  }, [username, isOwnProfile, currentUser, loadPosts]);

<<<<<<< HEAD
  if (notFound) return <div style={{ padding: 24 }}><h2 className="display">Student not found</h2></div>;
  if (!person) return null;

  const theirPosts = posts.filter((p) => p.authorUsername === person.username).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div>
      <div className="profile-header" style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <Avatar person={person} size="lg" />
        <div>
          <h2 className="display" style={{ marginBottom: 2 }}>{person.name}</h2>
          <p className="subtitle" style={{ marginBottom: 6, opacity: 0.65 }}>@{person.username}</p>
          {person.bio && <p className="subtitle" style={{ marginBottom: 6 }}>{person.bio}</p>}
          <p className="subtitle" style={{ marginBottom: isOwnProfile ? 14 : 0 }}>
            {person.department || ""}{person.level ? ` · ${person.level} Level` : ""}
          </p>
          {isOwnProfile && (
            <button type="button" className="btn btn-outline" style={{ width: "auto", padding: "9px 18px" }} onClick={() => navigate("/profile/edit")}>
              Edit profile
            </button>
          )}
        </div>
      </div>

      <h3 className="display" style={{ fontSize: 17, marginBottom: 12 }}>Posts</h3>
      {theirPosts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <p className="subtitle" style={{ marginBottom: 0 }}>{isOwnProfile ? "You haven't posted anything yet." : "No posts yet."}</p>
=======
  if (notFound) {
    return <div className="profile-page"><h2 className="display">Student not found</h2></div>;
  }
  if (!person) return null;

  const theirPosts = posts
    .filter((post) => post.authorUsername === person.username)
    .sort((a, b) => b.createdAt - a.createdAt);

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
                <button type="button" className="profile-edit-icon" onClick={() => navigate("/profile/edit")} aria-label="Edit profile" title="Edit profile">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
                </button>
              )}
            </div>

            {person.bio && <p className="profile-card-bio">{person.bio}</p>}

            <div className="profile-card-meta">
              {person.department || "Department not set"}
              {person.level ? ` · ${person.level} Level` : ""}
            </div>

            {isOwnProfile && (
              <button type="button" className="profile-edit-btn" onClick={() => navigate("/profile/edit")}>Edit profile</button>
            )}
          </div>
        </div>
      </div>

      <div className="profile-stats">
        <div><strong>{theirPosts.length}</strong><span>Posts</span></div>
        <div><strong>NWU</strong><span>Campus</span></div>
        <div><strong>{person.level || "—"}</strong><span>Level</span></div>
      </div>

      <div className="profile-section-head">
        <h3 className="section-label">Your posts</h3>
      </div>

      {theirPosts.length === 0 ? (
        <div className="empty-state" style={{ paddingTop: 24 }}>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {isOwnProfile ? "You haven't posted anything yet." : "No posts yet."}
          </p>
          {isOwnProfile && (
            <button type="button" className="btn btn-primary" style={{ maxWidth: 240 }} onClick={() => navigate("/create")}>Create your first post</button>
          )}
>>>>>>> 1322a16 (update)
        </div>
      ) : (
        theirPosts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
