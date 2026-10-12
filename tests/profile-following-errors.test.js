import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFollowError } from "../src/utils/followRelationshipErrors.js";

test("missing follow table is reported as pending backend integration, not as zero counts", () => {
  const error = normalizeFollowError({
    code: "42P01",
    message: 'relation "public.follows" does not exist',
  });
  assert.match(error.message, /backend needs to deploy the follows table/i);
});

test("permission errors preserve the backend restriction message", () => {
  const error = normalizeFollowError({ code: "42501", message: "Follow blocked by privacy policy." });
  assert.equal(error.message, "Follow blocked by privacy policy.");
});

test("ordinary errors remain actionable and are not converted to missing-schema errors", () => {
  const original = new Error("Temporary network failure");
  assert.equal(normalizeFollowError(original), original);
});
