/**
 * Keeps scroll restoration scoped to the exact feed history entry and user.
 * This deliberately does not alter scroll behaviour for other application routes.
 */
export function createFeedScrollPositionStore() {
  let saved = null;

  return {
    save(locationKey, userId, position) {
      if (!locationKey || !position) return;
      saved = {
        locationKey,
        userId: userId || null,
        position: {
          containerScrollTop: Math.max(0, Number(position.containerScrollTop) || 0),
          windowScrollY: Math.max(0, Number(position.windowScrollY) || 0),
        },
      };
    },

    get(locationKey, userId) {
      if (!saved) return null;
      if (saved.locationKey !== locationKey || saved.userId !== (userId || null)) return null;
      return { ...saved.position };
    },

    clear() {
      saved = null;
    },
  };
}

const feedScrollPositionStore = createFeedScrollPositionStore();

export function saveFeedScrollPosition(locationKey, userId, position) {
  feedScrollPositionStore.save(locationKey, userId, position);
}

export function getFeedScrollPosition(locationKey, userId) {
  return feedScrollPositionStore.get(locationKey, userId);
}

export function captureCurrentScrollPosition() {
  const container = document.getElementById("app-content-main");
  return {
    containerScrollTop: container?.scrollTop || 0,
    windowScrollY: window.scrollY || window.pageYOffset || 0,
  };
}

export function restoreFeedScrollPosition(position) {
  if (!position || typeof window === "undefined" || typeof document === "undefined") return;

  const container = document.getElementById("app-content-main");
  if (container) container.scrollTop = position.containerScrollTop;
  window.scrollTo(0, position.windowScrollY);
}
