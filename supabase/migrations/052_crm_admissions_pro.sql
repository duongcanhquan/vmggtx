-- ============================================================
-- 052: CRM Tuyển sinh chuyên nghiệp
-- - Bổ sung nguồn lead, độ nóng, email, lịch hẹn/follow-up, lý do mất
-- - Nhật ký chăm sóc: thêm zalo/sms/note/status_change + soft delete
-- - Chống trùng SĐT trong cùng org (lead còn sống)
-- ============================================================

-- ----- leads: cột nghiệp vụ -----
alter table public.leads
  add column if not exists email text,
  add column if not exists source text,
  add column if not exists priority text not null default 'warm',
  add column if not exists parent_name text,
  add column if not exists parent_phone varchar(20),
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists appointment_at timestamptz,
  add column if not exists lost_reason text;

-- Nới CHECK status (giữ 5 giai cũ — không đổi pipeline để tương thích)
-- source / priority constraints
alter table public.leads drop constraint if exists leads_source_check;
alter table public.leads
  add constraint leads_source_check
  check (
    source is null
    or source in (
      'walk_in', 'hotline', 'facebook', 'zalo', 'website',
      'referral', 'school_event', 'ads', 'other'
    )
  );

alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads
  add constraint leads_priority_check
  check (priority in ('hot', 'warm', 'cold'));

comment on column public.leads.source is 'Nguồn tiếp nhận lead (walk_in, facebook, zalo, …)';
comment on column public.leads.priority is 'Độ nóng: hot / warm / cold';
comment on column public.leads.next_follow_up_at is 'Hẹn chăm sóc tiếp theo (quá hạn = cần gọi lại)';
comment on column public.leads.appointment_at is 'Lịch hẹn test / tư vấn trực tiếp';
comment on column public.leads.lost_reason is 'Lý do mất lead khi status=lost';

create index if not exists idx_leads_org_source on public.leads (org_id, source)
  where deleted_at is null;
create index if not exists idx_leads_follow_up on public.leads (org_id, next_follow_up_at)
  where deleted_at is null and status not in ('enrolled', 'lost');
create index if not exists idx_leads_priority on public.leads (org_id, priority)
  where deleted_at is null;

-- Chống trùng SĐT trong cùng cơ sở (chỉ lead còn sống)
drop index if exists idx_leads_org_phone_live;
create unique index idx_leads_org_phone_live
  on public.leads (org_id, phone)
  where deleted_at is null;

-- ----- lead_activities: mở rộng loại + soft delete -----
alter table public.lead_activities
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_lead_activities_updated_at on public.lead_activities;
create trigger trg_lead_activities_updated_at
  before update on public.lead_activities
  for each row execute function public.set_updated_at();

alter table public.lead_activities drop constraint if exists lead_activities_activity_type_check;
alter table public.lead_activities
  add constraint lead_activities_activity_type_check
  check (
    activity_type in (
      'call', 'email', 'meeting', 'zalo', 'sms', 'note', 'status_change'
    )
  );

-- Policy update soft-delete activities (cùng điều kiện nhìn thấy lead)
drop policy if exists "lead_activities_update" on public.lead_activities;
create policy "lead_activities_update"
  on public.lead_activities for update
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and l.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id and l.deleted_at is null
    )
  );

-- Grant CRM (049): chỉ tạo khi đã có bảng user_menu_permissions
do $$
begin
  if to_regclass('public.user_menu_permissions') is null then
    raise notice '052: bo qua grant_crm_lead_activities (chua co 049)';
    return;
  end if;
  execute 'drop policy if exists "grant_crm_lead_activities" on public.lead_activities';
  execute $p$
    create policy "grant_crm_lead_activities"
      on public.lead_activities for all
      using (
        exists (
          select 1 from public.user_menu_permissions ump
          where ump.user_id = auth.uid()
            and ump.menu_key = ''crm''
            and ump.deleted_at is null
        )
        and public.is_org_in_my_subtree(org_id)
      )
      with check (
        exists (
          select 1 from public.user_menu_permissions ump
          where ump.user_id = auth.uid()
            and ump.menu_key = ''crm''
            and ump.deleted_at is null
        )
        and public.is_org_in_my_subtree(org_id)
      )
  $p$;
end $$;
