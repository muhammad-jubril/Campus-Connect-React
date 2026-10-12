-- Cover foreign keys used to retain reported-account and moderator identities.
-- Report queues and review history are expected to grow after moderation goes live.
begin;

create index if not exists content_reports_reported_user_id_idx
  on public.content_reports (reported_user_id);

create index if not exists content_reports_reviewed_by_idx
  on public.content_reports (reviewed_by);

create index if not exists marketplace_reports_reported_user_id_idx
  on public.marketplace_reports (reported_user_id);

create index if not exists marketplace_reports_reviewed_by_idx
  on public.marketplace_reports (reviewed_by);

commit;
