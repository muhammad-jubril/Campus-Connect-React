-- Extensions used by the scheduled push dispatcher.
-- The actual schedule is environment-specific and is created by diagnostics/push-dispatch-cron.sql.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
