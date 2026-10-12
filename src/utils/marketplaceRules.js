export const MAX_ACTIVE_LISTINGS = 3;
export const MARKETPLACE_PAGE_SIZE = 12;
export const MAX_TITLE_LENGTH = 30;
export const MAX_DESCRIPTION_LENGTH = 100;
export const MAX_LOCATION_LENGTH = 120;
export const MAX_PRICE_NGN = 10_000_000;
export const MAX_LISTING_IMAGE_BYTES = 400 * 1024;

export const MARKETPLACE_CATEGORIES = Object.freeze([
  "Electronics",
  "Books & Education",
  "Fashion",
  "Home & Hostel",
  "Food & Groceries",
  "Beauty & Personal Care",
  "Sports & Fitness",
  "Other",
]);

export const LISTING_CONDITIONS = Object.freeze([
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
]);

export const LISTING_STATUSES = Object.freeze(["active", "sold", "removed"]);

// This is a beta-level text filter and moderation aid, not a complete classifier.
const PROHIBITED_ITEM_TERMS = /\b(?:firearms?|guns?|pistols?|rifles?|ammunition|explosives?|bombs?|knives?\s+for\s+combat|cocaine|heroin|methamphetamine|meth|fentanyl|illicit\s+drugs?|marijuana|cannabis|weed|alcohol|beer|wine|liquor|tobacco|cigarettes?|vapes?|nicotine|prescription[- ]only\s+(?:medicines?|medications?|drugs?)|prescription\s+(?:medicines?|medications?|drugs?)|counterfeit|stolen\s+(?:goods?|phones?|laptops?|bikes?|bicycles?|items?|property|devices?)|fake\s+branded|replica\s+brand|sex\s+toys?|adult\s+toys?|adult\s+products?|pornography)\b/i;
const NON_PHYSICAL_SERVICE_TERMS = /(?:\b(?:tutoring|photography|graphic\s+design|repairs?|plumbing|cleaning)\s+(?:services?|available|offered|provided|sessions?|appointments?|for\s+hire)\b|\b(?:i|we)\s+(?:offer|provide|do)\s+(?:tutoring|photography|graphic\s+design|repairs?|plumbing|cleaning)\b|\bservices?\s+only\b|\bbook\s+(?:a\s+)?(?:session|appointment)\b)/i;

export function normaliseListingDraft(input = {}) {
  return {
    title: String(input.title ?? "").trim().replace(/\s+/g, " "),
    description: String(input.description ?? "").trim(),
    price: input.price === "" || input.price == null ? NaN : Number(input.price),
    category: String(input.category ?? "").trim(),
    condition: String(input.condition ?? "").trim(),
    pickup_location: String(input.pickup_location ?? "").trim().replace(/\s+/g, " "),
    negotiable: Boolean(input.negotiable),
  };
}

export function validateListingDraft(input = {}) {
  const value = normaliseListingDraft(input);
  const errors = {};

  if (!value.title) errors.title = "Enter a product title.";
  else if (value.title.length > MAX_TITLE_LENGTH) errors.title = `Use ${MAX_TITLE_LENGTH} characters or fewer.`;

  if (!Number.isFinite(value.price) || !Number.isInteger(value.price) || value.price < 1 || value.price > MAX_PRICE_NGN) {
    errors.price = `Enter a whole-number price from ₦1 to ₦${MAX_PRICE_NGN.toLocaleString("en-NG")}.`;
  }

  if (!MARKETPLACE_CATEGORIES.includes(value.category)) errors.category = "Choose a category.";
  if (!LISTING_CONDITIONS.some((condition) => condition.value === value.condition)) errors.condition = "Choose the item's condition.";

  if (!value.description) errors.description = "Add a description of the physical item.";
  else if (value.description.length > MAX_DESCRIPTION_LENGTH) errors.description = `Use ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;

  if (!value.pickup_location) errors.pickup_location = "Enter a campus or pickup location.";
  else if (value.pickup_location.length > MAX_LOCATION_LENGTH) errors.pickup_location = `Use ${MAX_LOCATION_LENGTH} characters or fewer.`;

  const listingText = `${value.title}\n${value.description}`;
  if (PROHIBITED_ITEM_TERMS.test(listingText)) {
    errors.prohibited = "This listing may include a prohibited item. Weapons, controlled drugs, alcohol, tobacco/vapes, prescription-only medicines, counterfeit or stolen goods, and adult products are not allowed.";
  } else if (NON_PHYSICAL_SERVICE_TERMS.test(listingText)) {
    errors.prohibited = "Marketplace listings are for physical products only. Offers for tutoring, photography, graphic design, repair, or other services are not allowed.";
  }

  return { value, errors, valid: Object.keys(errors).length === 0 };
}

export function hasActiveListingSlot(activeCount) {
  return Number.isInteger(activeCount) && activeCount >= 0 && activeCount < MAX_ACTIVE_LISTINGS;
}

export function isAllowedListingTransition(currentStatus, nextStatus) {
  if (!LISTING_STATUSES.includes(currentStatus) || !LISTING_STATUSES.includes(nextStatus)) return false;
  if (currentStatus === nextStatus) return true;
  if (currentStatus === "active") return nextStatus === "sold" || nextStatus === "removed";
  if (currentStatus === "sold") return nextStatus === "removed";
  return false;
}
