import test from "node:test";
import assert from "node:assert/strict";
import { createFeedScrollPositionStore } from "../src/utils/feedScrollPosition.js";

test("feed scroll position is restored for the same history entry and user", () => {
  const store = createFeedScrollPositionStore();
  const position = { containerScrollTop: 1834, windowScrollY: 0 };

  store.save("feed-entry-1", "user-1", position);

  assert.deepEqual(store.get("feed-entry-1", "user-1"), position);
});

test("a saved position does not leak to a different route history entry", () => {
  const store = createFeedScrollPositionStore();
  store.save("feed-entry-1", "user-1", { containerScrollTop: 800, windowScrollY: 0 });

  assert.equal(store.get("feed-entry-2", "user-1"), null);
});

test("a saved position does not leak between authenticated users", () => {
  const store = createFeedScrollPositionStore();
  store.save("feed-entry-1", "user-1", { containerScrollTop: 800, windowScrollY: 0 });

  assert.equal(store.get("feed-entry-1", "user-2"), null);
});

test("top-of-feed scroll positions are valid and restoration remains repeatable for browser back/forward", () => {
  const store = createFeedScrollPositionStore();
  const position = { containerScrollTop: 0, windowScrollY: 0 };
  store.save("feed-entry-1", "user-1", position);

  assert.deepEqual(store.get("feed-entry-1", "user-1"), position);
  assert.deepEqual(store.get("feed-entry-1", "user-1"), position);
});

test("clear removes a saved feed position", () => {
  const store = createFeedScrollPositionStore();
  store.save("feed-entry-1", "user-1", { containerScrollTop: 800, windowScrollY: 0 });
  store.clear();

  assert.equal(store.get("feed-entry-1", "user-1"), null);
});
