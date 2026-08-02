-- ================================================================
-- 059: PHÂN CÔNG CÔNG VIỆC NỘI BỘ (work_tasks)
-- - Module MỚI — không đụng tickets / teacher_requests
-- - Chỉ ADD bảng; soft-delete; org_id + RLS subtree
-- ================================================================

create table if not exists public.work_tasks (
  id           uuid primary key default uuid_generate_v4(),
  org_id       uuid not null references public.organizations (id),
  title        text not null,
  description  text,
  status       text not null default 'todo'
               check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority     text not null default 'normal'
               check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at       timestamptz,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index if not exists idx_work_tasks_org_status
  on public.work_tasks (org_id, status)
  where deleted_at is null;

create index if not exists idx_work_tasks_due
  on public.work_tasks (org_id, due_at)
  where deleted_at is null and status in ('todo', 'in_progress');

drop trigger if exists trg_work_tasks_updated_at on public.work_tasks;
create trigger trg_work_tasks_updated_at
  before update on public.work_tasks
  for each row execute function public.set_updated_at();

comment on table public.work_tasks is
  'Phan cong cong viec noi bo (P1 gap audit) — tach biet e-ticket.';

create table if not exists public.work_task_assignees (
  id         uuid primary key default uuid_generate_v4(),
  org_id     uuid not null references public.organizations (id),
  task_id    uuid not null references public.work_tasks (id),
  user_id    uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (task_id, user_id)
);

create index if not exists idx_work_task_assignees_user
  on public.work_task_assignees (user_id);

create index if not exists idx_work_task_assignees_task
  on public.work_task_assignees (task_id);

comment on table public.work_task_assignees is
  'Nguoi duoc giao viec — 1 task nhieu nguoi.';

alter table public.work_tasks enable row level security;
alter table public.work_task_assignees enable row level security;

-- Super admin
drop policy if exists "work_tasks_super_all" on public.work_tasks;
create policy "work_tasks_super_all"
  on public.work_tasks for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

drop policy if exists "work_assignees_super_all" on public.work_task_assignees;
create policy "work_assignees_super_all"
  on public.work_task_assignees for all
  using (public.get_my_role() = 'super_admin')
  with check (public.get_my_role() = 'super_admin');

-- Campus admin + academic staff: quản lý trong subtree
drop policy if exists "work_tasks_staff_manage" on public.work_tasks;
create policy "work_tasks_staff_manage"
  on public.work_tasks for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

drop policy if exists "work_assignees_staff_manage" on public.work_task_assignees;
create policy "work_assignees_staff_manage"
  on public.work_task_assignees for all
  using (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  )
  with check (
    public.get_my_role() in ('campus_admin', 'academic_staff')
    and public.is_org_in_my_subtree(org_id)
  );

-- Người được giao: đọc task + cập nhật status (qua update task)
drop policy if exists "work_tasks_assignee_select" on public.work_tasks;
create policy "work_tasks_assignee_select"
  on public.work_tasks for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.work_task_assignees a
      where a.task_id = work_tasks.id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "work_tasks_assignee_update" on public.work_tasks;
create policy "work_tasks_assignee_update"
  on public.work_tasks for update
  using (
    deleted_at is null
    and exists (
      select 1 from public.work_task_assignees a
      where a.task_id = work_tasks.id
        and a.user_id = auth.uid()
    )
  )
  with check (
    deleted_at is null
    and exists (
      select 1 from public.work_task_assignees a
      where a.task_id = work_tasks.id
        and a.user_id = auth.uid()
    )
  );

drop policy if exists "work_assignees_self_select" on public.work_task_assignees;
create policy "work_assignees_self_select"
  on public.work_task_assignees for select
  using (user_id = auth.uid());

-- Kiêm nhiệm menu work_tasks (049) — nếu đã có has_menu_grant
do $$
begin
  if to_regprocedure('public.has_menu_grant(uuid, text)') is null then
    raise notice '059: bo qua grant policy (chua co 049)';
    return;
  end if;
  execute $p$
    drop policy if exists "grant_work_tasks_all" on public.work_tasks;
    create policy "grant_work_tasks_all"
      on public.work_tasks for all
      using (
        public.has_menu_grant(auth.uid(), 'work_tasks')
        and public.is_org_in_my_subtree(org_id)
      )
      with check (
        public.has_menu_grant(auth.uid(), 'work_tasks')
        and public.is_org_in_my_subtree(org_id)
      );
  $p$;
  execute $p$
    drop policy if exists "grant_work_assignees_all" on public.work_task_assignees;
    create policy "grant_work_assignees_all"
      on public.work_task_assignees for all
      using (
        public.has_menu_grant(auth.uid(), 'work_tasks')
        and public.is_org_in_my_subtree(org_id)
      )
      with check (
        public.has_menu_grant(auth.uid(), 'work_tasks')
        and public.is_org_in_my_subtree(org_id)
      );
  $p$;
end $$;
