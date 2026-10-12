import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  markNotificationsRead,
  subscribeToNotifications,
  removeNotificationsChannel,
} from "../services/supabase/notifications";

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { currentUser } = useAuth();
  const userId = currentUser?.id || null;
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [listOwnerId, setListOwnerId] = useState(null);
  const [countOwnerId, setCountOwnerId] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [unreadCountError, setUnreadCountError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState("disconnected");
  const listLoadedRef = useRef(false);
  const notificationsRef = useRef([]);
  const listRequestRef = useRef(0);
  const countRequestRef = useRef(0);
  const readLocksRef = useRef(new Set());

  const visibleNotifications = listOwnerId === userId ? notifications : [];
  const visibleUnreadCount = countOwnerId === userId ? unreadCount : 0;
  notificationsRef.current = visibleNotifications;

  const refreshNotifications = useCallback(async ({ includeList = true } = {}) => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setListOwnerId(null);
      setCountOwnerId(null);
      setListError("");
      setUnreadCountError("");
      listLoadedRef.current = false;
      return false;
    }

    const countRequest = ++countRequestRef.current;
    const listRequest = includeList ? ++listRequestRef.current : null;
    if (includeList) {
      setListLoading(true);
      setListError("");
    }

    try {
      const countPromise = fetchUnreadNotificationCount(userId);
      const listPromise = includeList ? fetchNotifications(userId) : Promise.resolve(null);
      const [count, rows] = await Promise.all([countPromise, listPromise]);

      if (countRequest === countRequestRef.current) {
        setUnreadCount(count);
        setCountOwnerId(userId);
        setUnreadCountError("");
      }
      if (includeList && listRequest === listRequestRef.current) {
        setNotifications(rows);
        setListOwnerId(userId);
        listLoadedRef.current = true;
        setListError("");
      }
      return true;
    } catch (error) {
      const message = error?.message || "Couldn't load notifications. Please try again.";
      if (countRequest === countRequestRef.current) setUnreadCountError(message);
      if (includeList && listRequest === listRequestRef.current) setListError(message);
      return false;
    } finally {
      if (includeList && listRequest === listRequestRef.current) setListLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // Invalidate in-flight reads from a previous account and hide its data
    // immediately, before the new account's request completes.
    listRequestRef.current += 1;
    countRequestRef.current += 1;
    setNotifications([]);
    setUnreadCount(0);
    setListOwnerId(null);
    setCountOwnerId(null);
    setListLoading(false);
    setListError("");
    setUnreadCountError("");
    listLoadedRef.current = false;
    readLocksRef.current.clear();

    if (!userId) {
      setRealtimeStatus("disconnected");
      return undefined;
    }

    let active = true;
    refreshNotifications({ includeList: false });
    const channel = subscribeToNotifications(
      userId,
      () => {
        if (active) refreshNotifications({ includeList: listLoadedRef.current });
      },
      (status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setRealtimeStatus("live");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setRealtimeStatus("unavailable");
        else setRealtimeStatus("connecting");
      },
    );
    setRealtimeStatus("connecting");

    return () => {
      active = false;
      listLoadedRef.current = false;
      removeNotificationsChannel(channel);
      setRealtimeStatus("disconnected");
    };
  }, [userId, refreshNotifications]);

  const markRead = useCallback(async (notificationId) => {
    if (!userId) throw new Error("Sign in to update notifications.");
    const current = notificationsRef.current.find((item) => item.id === notificationId);
    if (!current || current.read || readLocksRef.current.has(notificationId)) return;

    readLocksRef.current.add(notificationId);
    try {
      await markNotificationRead(notificationId, userId);
      setNotifications((previous) => previous.map((item) => (
        item.id === notificationId ? { ...item, read: true } : item
      )));
      setUnreadCount((previous) => Math.max(0, previous - 1));
    } finally {
      readLocksRef.current.delete(notificationId);
    }
  }, [userId]);

  const markGroupRead = useCallback(async (notificationIds) => {
    if (!userId) throw new Error("Sign in to update notifications.");
    const ids = [...new Set(notificationIds || [])];
    const unreadIds = ids.filter((id) => (
      notificationsRef.current.some((item) => item.id === id && !item.read)
      && !readLocksRef.current.has(id)
    ));
    if (!unreadIds.length) return;

    unreadIds.forEach((id) => readLocksRef.current.add(id));
    try {
      await markNotificationsRead(unreadIds, userId);
      const unreadSet = new Set(unreadIds);
      setNotifications((previous) => previous.map((item) => (
        unreadSet.has(item.id) ? { ...item, read: true } : item
      )));
      setUnreadCount((previous) => Math.max(0, previous - unreadIds.length));
    } finally {
      unreadIds.forEach((id) => readLocksRef.current.delete(id));
    }
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) throw new Error("Sign in to update notifications.");
    const unreadIds = notificationsRef.current.filter((item) => !item.read).map((item) => item.id);
    await markAllNotificationsRead(userId);
    // Fetch the server's state after the mutation instead of marking every currently
    // cached row read optimistically. A realtime insert racing with this action must
    // remain unread if it was committed after the UPDATE statement ran.
    await refreshNotifications({ includeList: true });
    return unreadIds.length;
  }, [userId, refreshNotifications]);

  return (
    <NotificationsContext.Provider value={{
      notifications: visibleNotifications,
      unreadCount: visibleUnreadCount,
      listLoading,
      listError,
      unreadCountError,
      realtimeStatus,
      refreshNotifications,
      markRead,
      markGroupRead,
      markAllRead,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return context;
}
