-- ============================================================
-- 055: Cảnh báo học vụ vận hành đầy đủ
-- - severity: early (sớm) | danger (nguy hiểm)
-- - status: thêm in_progress (đang xử lý)
-- - ghi chú xử lý + người xử lý
-- ============================================================

alter table public.student_warnings
  add column if not exists severity text not null default 'early',
  add column if not exists handler_notes text,
  add column if not exists handled_by uuid references public.profiles (id),
  add column if not exists handled_at timestamptz,
  add column if not exists metric_value numeric(10, 2);

alter table public.student_warnings drop constraint if exists student_warnings_severity_check;
alter table public.student_warnings
  add constraint student_warnings_severity_check
  check (severity in ('early', 'danger'));

alter table public.student_warnings drop constraint if exists student_warnings_status_check;
alter table public.student_warnings
  add constraint student_warnings_status_check
  check (status in ('new', 'notified', 'in_progress', 'resolved'));

comment on column public.student_warnings.severity is 'early = canh bao som; danger = nguy hiem';
comment on column public.student_warnings.handler_notes is 'Ghi chu xu ly cua giao vu / TV';
comment on column public.student_warnings.metric_value is 'So lieu: so buoi vang hoac GPA tai thoi diem quet';

create index if not exists idx_student_warnings_severity
  on public.student_warnings (org_id, severity)
  where deleted_at is null;

create index if not exists idx_student_warnings_status
  on public.student_warnings (org_id, status)
  where deleted_at is null;
