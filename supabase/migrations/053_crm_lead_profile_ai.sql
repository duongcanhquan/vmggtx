-- ============================================================
-- 053: CRM hồ sơ lead đầy đủ + cấu hình AI tuyển sinh
-- - Bổ sung CCCD, PH đầy đủ, sở thích, ngành nghề, lịch học…
-- - custom_metadata trên leads; entity 'lead' cho trường động
-- - Cột hồ sơ HV tương ứng khi convert từ CRM
-- - Default org_settings CRM AI trong get_org_effective_config
-- ============================================================

-- ----- leads: hồ sơ tuyển sinh mở rộng -----
alter table public.leads
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists cccd varchar(20),
  add column if not exists address text,
  add column if not exists current_school text,
  add column if not exists education_level text,
  add column if not exists career_interest text,
  add column if not exists interests text,
  add column if not exists preferred_schedule text,
  add column if not exists call_summary text,
  add column if not exists parent_relation text,
  add column if not exists parent_email text,
  add column if not exists parent2_name text,
  add column if not exists parent2_phone varchar(20),
  add column if not exists parent2_relation text,
  add column if not exists custom_metadata jsonb not null default '{}'::jsonb;

alter table public.leads drop constraint if exists leads_gender_check;
alter table public.leads
  add constraint leads_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));

alter table public.leads drop constraint if exists leads_parent_relation_check;
alter table public.leads
  add constraint leads_parent_relation_check
  check (
    parent_relation is null
    or parent_relation in ('father', 'mother', 'guardian', 'other')
  );

comment on column public.leads.cccd is 'CCCD/CMND học viên tiềm năng';
comment on column public.leads.career_interest is 'Nganh nghe / chuong trinh quan tam';
comment on column public.leads.interests is 'So thich, tinh cach, ghi chu tu van';
comment on column public.leads.call_summary is 'Tom tat cuoc goi / cham soc gan nhat';
comment on column public.leads.custom_metadata is 'Truong dong entity=lead (org_custom_fields)';

create index if not exists idx_leads_cccd
  on public.leads (org_id, cccd)
  where deleted_at is null and cccd is not null;

-- ----- profiles: dong bo ho so HV sau convert -----
alter table public.profiles
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists cccd varchar(20),
  add column if not exists parent_name text,
  add column if not exists parent_phone varchar(20),
  add column if not exists parent_email text,
  add column if not exists parent_relation text,
  add column if not exists career_interest text,
  add column if not exists interests text;

alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('male', 'female', 'other'));

-- ----- Truong dong: them entity lead -----
alter table public.org_custom_fields drop constraint if exists org_custom_fields_entity_type_check;
alter table public.org_custom_fields
  add constraint org_custom_fields_entity_type_check
  check (entity_type in ('student', 'teacher', 'class', 'lead'));

-- ----- Default CRM trong get_org_effective_config -----
create or replace function public.get_org_effective_config(p_org_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb := '{
    "auto_attendance_sms": true,
    "max_absence_warning": 3,
    "grading_locked_days": 7,
    "require_manager_approval_for_refunds": true,
    "crm_ai_enabled": true,
    "crm_require_cccd": false,
    "crm_require_parent": true,
    "crm_require_career": false,
    "crm_ai_tone": "friendly",
    "crm_default_follow_up_hours": 24,
    "crm_ai_system_note": ""
  }'::jsonb;
  row_config jsonb;
begin
  for row_config in
    select s.config
    from public.org_settings s
    join public.organizations o on o.id = s.org_id
    where o.deleted_at is null
      and o.path @> (select path from public.organizations where id = p_org_id)
    order by nlevel(o.path) asc
  loop
    result := result || coalesce(row_config, '{}'::jsonb);
  end loop;

  return result;
end;
$$;

grant execute on function public.get_org_effective_config(uuid) to authenticated;
