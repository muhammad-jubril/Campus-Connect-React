import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Avatar from "../components/common/Avatar";
import PostCard from "../components/feed/PostCard";
import { useAuth } from "../hooks/useAuth";
import { usePosts } from "../hooks/usePosts";
import { getProfileByUsername, personFromProfileRow } from "../services/supabase/profiles";

export default function ProfilePage() {
  const { username } = useParams();
  const { currentUser } = useAuth();
  const { posts, loadPosts } = usePosts();
  const navigate = useNavigate();
  const isOwnProfile = !username || (currentUser && username === currentUser.username);

  const [person, setPerson] = useState(isOwnProfile ? currentUser : null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadPosts();
    if (isOwnProfile) { setPerson(currentUser); return; }
    getProfileByUsername(username).then(({ profile, error }) => {
      if (error || !profile) { setNotFound(true); return; }
      setPerson(personFromProfileRow(profile));
    });
  }, [username, isOwnProfile, currentUser, loadPosts]);

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
        </div>
      ) : (
        theirPosts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </div>
  );
}
