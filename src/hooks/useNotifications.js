// Compatibility bridge: the original project already has this .js import path,
// while the provider implementation uses JSX and lives in useNotifications.jsx.
export {
  NotificationsProvider,
  useNotifications,
} from "./useNotifications.jsx";
