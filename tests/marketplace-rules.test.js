import test from "node:test";
import assert from "node:assert/strict";
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

test("accepts a complete physical-product listing", () => {
  const result = validateListingDraft(validDraft);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.value.price, 12500);
});

test("requires a valid title, price, category, condition, description and location", () => {
  const result = validateListingDraft({});
  for (const field of ["title", "price", "category", "condition", "description", "pickup_location"]) {
    assert.ok(result.errors[field], `${field} should be invalid`);
  }
  assert.equal(result.valid, false);
});


test("enforces the compact product title and description limits", () => {
  assert.equal(MAX_TITLE_LENGTH, 30);
  assert.equal(MAX_DESCRIPTION_LENGTH, 100);

  const titleAtLimit = "T".repeat(MAX_TITLE_LENGTH);
  const descriptionAtLimit = "D".repeat(MAX_DESCRIPTION_LENGTH);
  assert.equal(validateListingDraft({ ...validDraft, title: titleAtLimit }).errors.title, undefined);
  assert.equal(validateListingDraft({ ...validDraft, description: descriptionAtLimit }).errors.description, undefined);
  assert.match(validateListingDraft({ ...validDraft, title: `${titleAtLimit}T` }).errors.title || "", /30 characters or fewer/i);
  assert.match(validateListingDraft({ ...validDraft, description: `${descriptionAtLimit}D` }).errors.description || "", /100 characters or fewer/i);
});

test("rejects fractional, non-positive and unreasonable NGN prices", () => {
  for (const price of ["0", "-10", "10.5", "not-a-price", String(MAX_PRICE_NGN + 1)]) {
    assert.ok(validateListingDraft({ ...validDraft, price }).errors.price, `price ${price} should fail`);
  }
});

test("supports only the specified product categories", () => {
  assert.equal(MARKETPLACE_CATEGORIES.length, 8);
  assert.ok(validateListingDraft({ ...validDraft, category: "Tutoring" }).errors.category);
});

test("blocks explicitly prohibited item types in title or description", () => {
  for (const description of [
    "Brand new vape device",
    "Selling a counterfeit bag",
    "Stolen phone, cheap",
    "Prescription-only medicines",
    "Adult products for sale",
  ]) {
    assert.ok(validateListingDraft({ ...validDraft, description }).errors.prohibited);
  }
});

test("rejects service offers rather than allowing them as physical products", () => {
  for (const description of [
    "Photography services available",
    "I offer tutoring for first year students",
    "Graphic design services for hire",
    "Phone repair services available",
  ]) {
    assert.match(validateListingDraft({ ...validDraft, description }).errors.prohibited || "", /physical products only/i);
  }
});

test("allows a seller to create up to three active listings, not a fourth", () => {
  assert.equal(MAX_ACTIVE_LISTINGS, 3);
  assert.equal(hasActiveListingSlot(0), true);
  assert.equal(hasActiveListingSlot(2), true);
  assert.equal(hasActiveListingSlot(3), false);
  assert.equal(hasActiveListingSlot(-1), false);
});

test("listing status transitions are one-way and sold listings can be removed", () => {
  assert.equal(isAllowedListingTransition("active", "sold"), true);
  assert.equal(isAllowedListingTransition("active", "removed"), true);
  assert.equal(isAllowedListingTransition("sold", "removed"), true);
  assert.equal(isAllowedListingTransition("sold", "active"), false);
  assert.equal(isAllowedListingTransition("removed", "active"), false);
  assert.equal(isAllowedListingTransition("removed", "sold"), false);
});
