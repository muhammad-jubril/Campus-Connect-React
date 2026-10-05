import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import PostCard from "../components/feed/PostCard";
import MobileMenuButton from "../components/layout/MobileMenuButton";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { getProfileByUsername, personFromProfileRow } from "../services/supabase/profiles";

export default function ProfilePage() {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { posts, loadPosts } = usePosts();
  const navigate = useNavigate();
  const isOwnProfile = !username || username === currentUser?.username;

  const [person, setPerson] = useState(isOwnProfile ? currentUser : null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadPosts();
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
      setPerson(personFromProfileRow(profile));
    });
  }, [username, isOwnProfile, currentUser, loadPosts]);

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
        </div>
      ) : (
        theirPosts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
