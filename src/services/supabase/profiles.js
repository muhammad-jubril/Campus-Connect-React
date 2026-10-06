import { supabase } from "./client";

export async function checkUsernameAvailable(username) {
  const { data, error } = await supabase.rpc("username_available", { p_username: username });
  if (error) throw error;
  return data;
}

export async function getProfileByUsername(username) {
  const { data, error } = await supabase.from("profiles").select("*").eq("username", username).single();
  return { profile: data, error };
}

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return { profile: data, error };
}

export async function createProfile(profile) {
  const { error } = await supabase.from("profiles").insert(profile);
  if (error) throw error;
}

export async function updateProfile(userId, updates) {
  const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
  if (error) throw error;
}

// A user's own row in `profiles` maps 1:1 onto the shape the rest of the
// app expects — every screen reads a person off of this shape, not the
// raw Supabase row.
export function personFromProfileRow(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    faculty: row.faculty || "",
    department: row.department || "",
    level: row.level || "",
    avatarDataUrl: row.avatar_url || "",
    bio: row.bio || "",
    tone: (row.username || "").split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4,
  };
}
