import { supabase } from "./client";
import { validateOptimizedImage } from "../../utils/imageCompression";
import { MARKETPLACE_PAGE_SIZE } from "../../utils/marketplaceRules";

export const MARKETPLACE_IMAGE_BUCKET = "marketplace-images";

const LISTING_COLUMNS = [
  "id",
  "seller_id",
  "title",
  "description",
  "price",
  "category",
  "condition",
  "images",
  "image_path",
  "status",
  "pickup_location",
  "negotiable",
  "created_at",
  "updated_at",
].join(",");

function throwIfError(error) {
  if (!error) return;
  if (error.code === "23505") {
    throw new Error("You've already reported this listing, or a record with the same value exists.");
  }
  if (error.code === "23514" || error.code === "P0001") {
    throw new Error(error.message || "The listing doesn't meet Campus Connect marketplace rules.");
  }
  throw error;
}

function escapeLikeTerm(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

function publicImageFor(listing) {
  return Array.isArray(listing.images) && typeof listing.images[0] === "string"
    ? listing.images[0]
    : null;
}

async function attachSellerProfiles(rows) {
  if (!rows?.length) return [];
  const sellerIds = [...new Set(rows.map((row) => row.seller_id).filter(Boolean))];
  if (!sellerIds.length) return rows.map((row) => ({ ...row, image_url: publicImageFor(row), seller: null }));

  // Fetch safe, display-only profile fields separately rather than selecting *.
  // This avoids exposing private profile fields and doesn't depend on a guessed
  // PostgREST foreign-key constraint name in the existing database.
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,username,name,avatar_url,faculty,department,level")
    .in("id", sellerIds);

  if (error) {
    // A profile lookup error should not hide otherwise readable listings.
    console.error("Marketplace seller profile lookup failed:", error);
  }

  const byId = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    image_url: publicImageFor(row),
    seller: byId.get(row.seller_id) || null,
  }));
}

function applyFilters(query, filters = {}) {
  const search = String(filters.search || "").trim();
  if (search) query = query.ilike("title", `%${escapeLikeTerm(search)}%`);

  if (filters.category) query = query.eq("category", filters.category);
  if (filters.condition) query = query.eq("condition", filters.condition);

  if (filters.minPrice !== "" && filters.minPrice != null) {
    const minPrice = Number(filters.minPrice);
    if (Number.isFinite(minPrice) && minPrice >= 0) query = query.gte("price", minPrice);
  }
  if (filters.maxPrice !== "" && filters.maxPrice != null) {
    const maxPrice = Number(filters.maxPrice);
    if (Number.isFinite(maxPrice) && maxPrice >= 0) query = query.lte("price", maxPrice);
  }

  const location = String(filters.location || "").trim();
  if (location) query = query.ilike("pickup_location", `%${escapeLikeTerm(location)}%`);
  return query;
}

/** Fetch one bounded page of public, active marketplace listings, newest first. */
export async function fetchListings(filters = {}, page = 0, pageSize = MARKETPLACE_PAGE_SIZE) {
  const safePage = Number.isInteger(page) && page >= 0 ? page : 0;
  const safePageSize = Number.isInteger(pageSize) ? Math.min(Math.max(pageSize, 1), MARKETPLACE_PAGE_SIZE) : MARKETPLACE_PAGE_SIZE;
  let query = supabase
    .from("marketplace_listings")
    .select(LISTING_COLUMNS)
    .eq("status", "active");
  query = applyFilters(query, filters);
  const from = safePage * safePageSize;
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + safePageSize - 1);
  throwIfError(error);
  return attachSellerProfiles(data || []);
}

/** Seller-only management list. Removed rows stay in the database but are hidden here. */
export async function fetchMyListings(sellerId) {
  if (!sellerId) throw new Error("Sign in to manage your listings.");
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select(LISTING_COLUMNS)
    .eq("seller_id", sellerId)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, 99);
  throwIfError(error);
  return attachSellerProfiles(data || []);
}

function listingWriteFields(payload) {
  return {
    title: payload.title,
    description: payload.description,
    price: payload.price,
    category: payload.category,
    condition: payload.condition,
    pickup_location: payload.pickup_location,
    negotiable: Boolean(payload.negotiable),
    images: payload.images ?? null,
    image_path: payload.image_path ?? null,
  };
}

export async function createListing(sellerId, payload) {
  if (!sellerId) throw new Error("Sign in before creating a listing.");
  const { data, error } = await supabase
    .from("marketplace_listings")
    .insert({ seller_id: sellerId, ...listingWriteFields(payload), status: "active" })
    .select(LISTING_COLUMNS)
    .single();
  throwIfError(error);
  return data;
}

export async function updateListing(listingId, sellerId, payload) {
  if (!listingId || !sellerId) throw new Error("The listing could not be identified.");
  const allowed = {};
  const writableKeys = ["title", "description", "price", "category", "condition", "pickup_location", "negotiable", "images", "image_path", "status"];
  for (const key of writableKeys) {
    if (Object.hasOwn(payload, key)) allowed[key] = payload[key];
  }
  if (Object.hasOwn(allowed, "negotiable")) allowed.negotiable = Boolean(allowed.negotiable);

  const { data, error } = await supabase
    .from("marketplace_listings")
    .update(allowed)
    .eq("id", listingId)
    .eq("seller_id", sellerId)
    .select(LISTING_COLUMNS)
    .single();
  throwIfError(error);
  return data;
}

export async function markListingSold(listingId, sellerId) {
  return updateListing(listingId, sellerId, { status: "sold" });
}

export async function removeListing(listingId, sellerId) {
  return updateListing(listingId, sellerId, { status: "removed" });
}

export async function clearListingImage(listingId, sellerId) {
  const { error } = await supabase
    .from("marketplace_listings")
    .update({ images: null, image_path: null })
    .eq("id", listingId)
    .eq("seller_id", sellerId)
    .eq("status", "removed");
  throwIfError(error);
}

export async function submitListingReport({ listingId, reporterId, reason, details = "" }) {
  if (!listingId || !reporterId) throw new Error("Sign in to report a listing.");
  const { error } = await supabase.from("marketplace_reports").insert({
    listing_id: listingId,
    reporter_id: reporterId,
    reason,
    details: details.trim() || null,
  });
  throwIfError(error);
}

function extensionForImageType(type) {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  throw new Error("Only JPEG, PNG and WebP product images are supported.");
}


/** Check whether the database now points at an uploaded path before cleanup.
 * If the listing write response was lost after commit, this prevents deleting
 * an image that is already referenced by a saved listing.
 */
export async function isListingImageReferenced(path, sellerId, listingId = null) {
  if (!path || !sellerId) return false;
  let query = supabase
    .from("marketplace_listings")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("image_path", path)
    .limit(1);
  if (listingId) query = query.eq("id", listingId);
  const { data, error } = await query;
  throwIfError(error);
  return Boolean(data?.length);
}

/** Upload the already-optimised listing image to a dedicated, image-only bucket. */
export async function uploadListingImage(file, sellerId) {
  if (!sellerId) throw new Error("Sign in before uploading a product image.");
  await validateOptimizedImage(file, "listing");
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const path = `${sellerId}/${randomId}.${extensionForImageType(file.type)}`;
  const { error } = await supabase.storage.from(MARKETPLACE_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  throwIfError(error);
  const { data } = supabase.storage.from(MARKETPLACE_IMAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    try { await supabase.storage.from(MARKETPLACE_IMAGE_BUCKET).remove([path]); }
    catch (cleanupError) { console.error("Could not clean up an image without a public URL:", cleanupError); }
    throw new Error("The product image uploaded, but its public URL could not be created.");
  }
  return { path, url: data.publicUrl };
}

/** Never deletes a path outside the signed-in seller's own folder. */
export async function removeListingImage(path, sellerId) {
  if (!path) return;
  if (!sellerId || typeof path !== "string" || !path.startsWith(`${sellerId}/`) || path.includes("..")) {
    throw new Error("The product image path doesn't belong to this account.");
  }
  const { error } = await supabase.storage.from(MARKETPLACE_IMAGE_BUCKET).remove([path]);
  throwIfError(error);
}
