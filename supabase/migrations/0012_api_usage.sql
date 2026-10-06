-- 카카오 로컬 API 호출량 기록 (일별).
--
-- 서버가 카카오를 새로 호출할 때마다 호출 횟수를 더한다. 캐시에서 답한 요청은 세지 않는다.
-- 보는 곳: `python data/scripts/show_usage.py` 또는 Supabase 대시보드(api_usage).
--
-- 중요: 이 값은 **참고용 지표**다. 공개된 anon 키로 누구나 bump_usage() 를 부를 수 있어서
-- 값을 부풀릴 수 있으므로, 앱은 이 값을 보고 기능을 막는 데 쓰지 않는다. (한도 보호는 카카오가
-- 한도 초과를 알려 올 때 반응하는 방식으로 한다.) 호출 한 번에 더할 수 있는 양도 제한한다.
-- 날짜는 카카오 한도가 초기화되는 한국 시간 기준이다.

create table if not exists api_usage (
  day date not null,
  kind text not null,
  calls integer not null default 0,
  requests integer not null default 0,
  primary key (day, kind)
);

-- 읽기·쓰기 정책을 만들지 않는다: 앱은 아래 함수로만 쓰고, 읽기는 대시보드(서비스 권한)로만 한다.
alter table api_usage enable row level security;

create or replace function bump_usage(p_kind text, p_calls integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind <> 'kakao_local' or p_calls is null or p_calls < 1 or p_calls > 40 then
    return;
  end if;

  insert into api_usage (day, kind, calls, requests)
  values ((now() at time zone 'Asia/Seoul')::date, p_kind, p_calls, 1)
  on conflict (day, kind) do update
    set calls = api_usage.calls + excluded.calls,
        requests = api_usage.requests + 1;
end;
$$;
