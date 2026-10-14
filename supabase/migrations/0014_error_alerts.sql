-- 오류 알림(메일): log_error() 가 "이 오류는 알림을 보내도 된다"를 판단해서 알려 준다.
--
-- 메일을 실제로 보내는 일은 앱(서버)이 한다. DB 는 폭주를 막기 위한 판단만 맡는다.
--   · 같은 종류(kind)는 60분에 한 번만 알린다.
--   · 종류와 상관없이 하루 20통을 넘기지 않는다.
--   · 서버가 여러 대여도 한 번만 허락하도록 잠금(advisory lock)을 건다.
-- 앱이 알림 설정(p_alert)을 켜지 않았으면 판단하지도, 기록하지도 않는다. 그래서 설정 전에는 지금처럼 기록만 한다.
--
-- 한계: log_error() 는 공개 키로 누구나 부를 수 있다. 가짜 오류로 알림을 일부러 일으킬 수는 있지만
-- 위 제한 때문에 메일은 하루 20통을 넘지 않는다. 반대로 가짜 오류가 먼저 알림 칸을 차지하면 같은 종류의
-- 진짜 오류 알림이 최대 60분 늦을 수 있다(기록은 그대로 남는다).

create table if not exists alert_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null
);
create index if not exists alert_log_kind_idx on alert_log (kind, created_at desc);
alter table alert_log enable row level security; -- 정책 없음: 앱은 읽고 쓸 수 없고 함수만 쓴다

-- 반환 형식이 바뀌므로 이전 함수를 지우고 다시 만든다 (이전 화면·서버가 5개 인자로 불러도 그대로 동작한다)
drop function if exists log_error(text, text, text, jsonb, text);

create function log_error(
  p_source text,
  p_kind text,
  p_message text,
  p_detail jsonb default '{}'::jsonb,
  p_release text default null,
  p_alert boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
  v_message text;
  v_count_1h integer;
  v_count_24h integer;
begin
  if p_source not in ('server', 'client') or coalesce(p_kind, '') = '' then
    return null;
  end if;

  -- 폭주하면 버린다 (공개 함수라 로그 테이블이 무한히 커지지 않게)
  if (select count(*) from error_logs where created_at > now() - interval '1 minute') >= 60 then
    return null;
  end if;
  if (select count(*) from error_logs where created_at > now() - interval '1 day') >= 5000 then
    return null;
  end if;

  v_kind := left(p_kind, 60);
  v_message := left(coalesce(p_message, ''), 300);

  insert into error_logs (source, kind, message, detail, release)
  values (
    p_source,
    v_kind,
    v_message,
    case
      when p_detail is null then '{}'::jsonb
      when pg_column_size(p_detail) > 4000 then jsonb_build_object('truncated', true)
      else p_detail
    end,
    left(p_release, 40)
  );

  if random() < 0.02 then
    delete from error_logs where created_at < now() - interval '30 days';
    delete from alert_log where created_at < now() - interval '30 days';
  end if;

  if not coalesce(p_alert, false) then
    return null;
  end if;

  -- 알림 칸을 차지할 수 있는지 한 번에 한 요청만 판단한다
  perform pg_advisory_xact_lock(hashtext('log_error_alert'));
  if exists (
    select 1 from alert_log
    where kind = v_kind and created_at > now() - interval '60 minutes'
  ) then
    return null;
  end if;
  if (select count(*) from alert_log where created_at > now() - interval '1 day') >= 20 then
    return null;
  end if;
  insert into alert_log (kind) values (v_kind);

  select count(*) into v_count_1h from error_logs
    where kind = v_kind and created_at > now() - interval '1 hour';
  select count(*) into v_count_24h from error_logs
    where kind = v_kind and created_at > now() - interval '1 day';

  return jsonb_build_object(
    'source', p_source,
    'kind', v_kind,
    'message', v_message,
    'release', left(p_release, 40),
    'count_1h', v_count_1h,
    'count_24h', v_count_24h
  );
end;
$$;
