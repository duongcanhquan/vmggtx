-- ================================================================
-- 042: BÁO CÁO TỔNG QUAN 1 ROUND-TRIP (dashboard /)
-- - RPC get_overview_report(p_org_ids): gộp TOÀN BỘ số liệu vận hành
--   (buổi học hôm nay, điểm danh hôm nay, xu hướng 7 ngày, trạng thái
--   ghi danh, danh sách vắng hôm nay) vào 1 jsonb duy nhất
--   -> thay cho ~20 count query lẻ, tải dashboard nhanh hơn hẳn.
-- - SECURITY INVOKER (mặc định): RLS của attendance/class_sessions/
--   enrollments/profiles vẫn áp dụng -> user chỉ đếm được dữ liệu
--   trong phạm vi của mình, truyền org_id lạ cũng không lộ số liệu.
-- - Múi giờ tính "hôm nay": Asia/Ho_Chi_Minh.
-- ================================================================

create or replace function public.get_overview_report(p_org_ids uuid[])
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_day_start  timestamptz;
  v_day_end    timestamptz;
  v_week_start timestamptz;
  v_result     jsonb;
begin
  v_day_start  := date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
                    at time zone 'Asia/Ho_Chi_Minh';
  v_day_end    := v_day_start + interval '1 day';
  v_week_start := v_day_start - interval '6 days';

  select jsonb_build_object(
    -- Buổi học HÔM NAY theo trạng thái: {scheduled: n, completed: n, cancelled: n}
    'sessions_today', coalesce((
      select jsonb_object_agg(t.status, t.c) from (
        select s.status, count(*)::int c
        from class_sessions s
        where s.org_id = any(p_org_ids)
          and s.deleted_at is null
          and s.start_time >= v_day_start and s.start_time < v_day_end
        group by s.status
      ) t), '{}'::jsonb),

    -- Lượt điểm danh HÔM NAY: {present: n, absent: n, late: n, excused: n}
    'attendance_today', coalesce((
      select jsonb_object_agg(t.status, t.c) from (
        select a.status, count(*)::int c
        from attendance a
        join class_sessions s on s.id = a.session_id
        where a.org_id = any(p_org_ids)
          and a.deleted_at is null
          and s.start_time >= v_day_start and s.start_time < v_day_end
        group by a.status
      ) t), '{}'::jsonb),

    -- Xu hướng điểm danh 7 NGÀY gần nhất (present gộp cả late)
    'attendance_week', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', t.d, 'present', t.present, 'absent', t.absent, 'excused', t.excused
      ) order by t.d) from (
        select to_char(s.start_time at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') d,
               count(*) filter (where a.status in ('present', 'late'))::int present,
               count(*) filter (where a.status = 'absent')::int absent,
               count(*) filter (where a.status = 'excused')::int excused
        from attendance a
        join class_sessions s on s.id = a.session_id
        where a.org_id = any(p_org_ids)
          and a.deleted_at is null
          and s.start_time >= v_week_start and s.start_time < v_day_end
        group by 1
      ) t), '[]'::jsonb),

    -- Vòng đời ghi danh: {active: n, paused: n, dropped: n, completed: n}
    'enrollment_status', coalesce((
      select jsonb_object_agg(t.status, t.c) from (
        select e.status, count(*)::int c
        from enrollments e
        where e.org_id = any(p_org_ids) and e.deleted_at is null
        group by e.status
      ) t), '{}'::jsonb),

    -- Danh sách học sinh VẮNG hôm nay (tối đa 10, kèm lớp + ghi chú)
    'absent_today', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', t.full_name, 'class', t.class_name,
        'status', t.status, 'note', t.note
      )) from (
        select p.full_name, c.name class_name, a.status, a.note
        from attendance a
        join class_sessions s on s.id = a.session_id
        join classes c on c.id = s.class_id
        join profiles p on p.id = a.student_id
        where a.org_id = any(p_org_ids)
          and a.deleted_at is null
          and a.status in ('absent', 'excused')
          and s.start_time >= v_day_start and s.start_time < v_day_end
        order by p.full_name
        limit 10
      ) t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end $$;

grant execute on function public.get_overview_report(uuid[]) to authenticated;

comment on function public.get_overview_report(uuid[]) is
  'Báo cáo tổng quan dashboard: gộp mọi số liệu vận hành vào 1 jsonb (1 round-trip). SECURITY INVOKER - RLS áp dụng.';

-- Index phục vụ lọc buổi học theo cơ sở + khoảng thời gian
create index if not exists idx_class_sessions_org_start
  on public.class_sessions (org_id, start_time);
