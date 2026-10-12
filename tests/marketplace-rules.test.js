import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_ACTIVE_LISTINGS,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_PRICE_NGN,
  MARKETPLACE_CATEGORIES,
  hasActiveListingSlot,
  isAllowedListingTransition,
  validateListingDraft,
} from "../src/utils/marketplaceRules.js";

const validDraft = {
  title: "Scientific calculator",
  price: "12500",
  category: "Electronics",
  condition: "good",
  description: "A working calculator in good condition.",
  pickup_location: "NWU main gate",
  negotiable: false,
};

test("accepts a complete physical-product listing and normalises fields", () => {
  const result = validateListingDraft({ ...validDraft, title: "  Scientific   calculator  " });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.price, 12500);
  assert.equal(result.value.title, "Scientific calculator");
});

test("requires all mandatory listing fields", () => {
  const result = validateListingDraft({});
  for (const field of ["title", "price", "category", "condition", "description", "pickup_location"]) {
    assert.ok(result.errors[field], `${field} should be invalid`);
  }
  assert.equal(result.valid, false);
});

test("enforces compact title, description, and pickup-location limits", () => {
  assert.equal(MAX_TITLE_LENGTH, 30);
  assert.equal(MAX_DESCRIPTION_LENGTH, 100);
  const titleAtLimit = "T".repeat(MAX_TITLE_LENGTH);
  const descriptionAtLimit = "D".repeat(MAX_DESCRIPTION_LENGTH);
  assert.equal(validateListingDraft({ ...validDraft, title: titleAtLimit }).errors.title, undefined);
  assert.equal(validateListingDraft({ ...validDraft, description: descriptionAtLimit }).errors.description, undefined);
  assert.match(validateListingDraft({ ...validDraft, title: `${titleAtLimit}T` }).errors.title || "", /30 characters or fewer/i);
  assert.match(validateListingDraft({ ...validDraft, description: `${descriptionAtLimit}D` }).errors.description || "", /100 characters or fewer/i);
  assert.ok(validateListingDraft({ ...validDraft, pickup_location: "L".repeat(121) }).errors.pickup_location);
});

test("rejects fractional, non-positive and unreasonable NGN prices", () => {
  for (const price of ["0", "-10", "10.5", "not-a-price", String(MAX_PRICE_NGN + 1)]) {
    assert.ok(validateListingDraft({ ...validDraft, price }).errors.price, `price ${price} should fail`);
  }
  assert.equal(validateListingDraft({ ...validDraft, price: String(MAX_PRICE_NGN) }).errors.price, undefined);
});

test("supports only the configured product categories and conditions", () => {
  assert.equal(MARKETPLACE_CATEGORIES.length, 8);
  assert.ok(validateListingDraft({ ...validDraft, category: "Tutoring" }).errors.category);
  assert.ok(validateListingDraft({ ...validDraft, condition: "broken" }).errors.condition);
});

test("blocks explicitly prohibited item types in title or description", () => {
  for (const description of [
    "Brand new vape device", "Selling a counterfeit bag", "Stolen phone, cheap",
    "Prescription-only medicines", "Adult products for sale",
  ]) assert.ok(validateListingDraft({ ...validDraft, description }).errors.prohibited);
});

test("rejects service offers rather than allowing them as physical products", () => {
  for (const description of [
    "Photography services available", "I offer tutoring for first year students",
    "Graphic design services for hire", "Phone repair services available",
  ]) assert.match(validateListingDraft({ ...validDraft, description }).errors.prohibited || "", /physical products only/i);
});

test("allows three active listings but not a fourth", () => {
  assert.equal(MAX_ACTIVE_LISTINGS, 3);
  assert.equal(hasActiveListingSlot(0), true);
  assert.equal(hasActiveListingSlot(2), true);
  assert.equal(hasActiveListingSlot(3), false);
  assert.equal(hasActiveListingSlot(-1), false);
});

test("listing status transitions are one-way; sold listings can be removed", () => {
  assert.equal(isAllowedListingTransition("active", "sold"), true);
  assert.equal(isAllowedListingTransition("active", "removed"), true);
  assert.equal(isAllowedListingTransition("sold", "removed"), true);
  assert.equal(isAllowedListingTransition("sold", "active"), false);
  assert.equal(isAllowedListingTransition("removed", "active"), false);
  assert.equal(isAllowedListingTransition("removed", "sold"), false);
});

test("database rules use scale-free numeric prices and reject fractional values before persistence", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261012120000_marketplace_numeric_price.sql", import.meta.url), "utf8");
  assert.match(migration, /alter column price type numeric using price::numeric/i);
  assert.match(migration, /new\.price <> trunc\(new\.price\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /create policy marketplace_listings_update_own/i);
  assert.match(migration, /create or replace function public\.enforce_marketplace_listing_rules\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
});


test("listing image upload revalidates optimisation at the Storage service boundary", async () => {
  const service = await readFile(new URL("../src/services/supabase/marketplace.js", import.meta.url), "utf8");
  assert.match(service, /const optimizedFile = await optimizeImage\(file, "listing"\)/);
  assert.match(service, /validateOptimizedImage\(optimizedFile, "listing"\)/);
  assert.match(service, /\.upload\(path, optimizedFile,/);
  assert.doesNotMatch(service, /\.upload\(path, file,/);
});

test("marketplace database migrations provide server-side ownership, visibility, and Storage controls", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261012100000_marketplace_beta.sql", import.meta.url), "utf8");
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock/);
  assert.match(migration, /alter column status set default 'active'[\s\S]*alter column status set not null/i);
  assert.match(migration, /create policy marketplace_listings_insert_own[\s\S]*with check \(seller_id=\(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /using \(status='active' or seller_id=\(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /file_size_limit\s*,\s*allowed_mime_types[\s\S]*marketplace-images/i);
  assert.match(migration, /marketplace_images_insert_own_folder[\s\S]*storage\.foldername\(name\)/i);
  assert.match(migration, /create policy marketplace_reports_insert_own/i);
  assert.match(migration, /create or replace function public\.validate_marketplace_report\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
});

test("substring search has optional trigram indexes and image policies are reset before re-creation", async () => {
  const indexes = await readFile(new URL("../supabase/migrations/20261012130000_marketplace_search_indexes.sql", import.meta.url), "utf8");
  const coreMigration = await readFile(new URL("../supabase/migrations/20261012100000_marketplace_beta.sql", import.meta.url), "utf8");
  assert.match(indexes, /marketplace_listings_active_title_trgm_idx/);
  assert.match(indexes, /marketplace_listings_active_location_trgm_idx/);
  assert.match(indexes, /gin_trgm_ops/);
  assert.match(indexes, /marketplace_listings_image_path_unique_idx/);
  assert.match(coreMigration, /coalesce\(qual,''\) ilike '%marketplace-images%'/);
  assert.match(coreMigration, /marketplace_images_insert_own_folder/);
  assert.match(coreMigration, /already contains objects in a private bucket/);
  assert.match(coreMigration, /grant insert \(seller_id, title, description, price, category, condition, images, image_path, pickup_location, negotiable\)/i);
});


test("listing composer has a synchronous lock against duplicate save events", async () => {
  const page = await readFile(new URL("../src/pages/MarketplacePage.jsx", import.meta.url), "utf8");
  assert.match(page, /const submitLockRef = useRef\(false\)/);
  assert.match(page, /if \(submitLockRef\.current \|\| submitting \|\| imageProcessing\) return/);
  assert.match(page, /submitLockRef\.current = true/);
  assert.match(page, /submitLockRef\.current = false/);
});


test("listing report modal manages focus, traps Tab, restores the opener, and supports Escape", async () => {
  const page = await readFile(new URL("../src/pages/MarketplacePage.jsx", import.meta.url), "utf8");
  assert.match(page, /reportDialogRef = useRef\(null\)/);
  assert.match(page, /reportOpenerRef = useRef\(null\)/);
  assert.match(page, /event\.key === "Escape" && !reportSubmittingRef\.current/);
  assert.match(page, /event\.key !== "Tab"/);
  assert.match(page, /opener\.focus\(\{ preventScroll: true \}\)/);
});


test("forward migration hardens already-deployed trigger functions without changing their bodies", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261012140000_marketplace_trigger_privileges.sql", import.meta.url), "utf8");
  assert.match(migration, /alter function public\.enforce_marketplace_listing_rules\(\) security definer/i);
  assert.match(migration, /alter function public\.validate_marketplace_report\(\) security definer/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.validate_marketplace_report\(\) from public, anon, authenticated/i);
});
