-- 오류 모니터링: 서버와 화면에서 난 오류를 한 곳에 모은다.
--
-- 외부 서비스 없이 지금 쓰는 Supabase 에 쌓는다. 보는 곳은 Supabase 대시보드(Table Editor)나
-- `python data/scripts/show_errors.py` 이다. 앱(공개 anon 키)은 쓰기 함수만 부를 수 있고 읽을 수 없다.
--
-- 개인정보: 좌표, IP, 사용자 계정은 저장하지 않는다. 경로(path)와 짧은 브라우저 정보만 남긴다.
-- 악용 대비: 공개된 anon 키로 누구나 log_error() 를 부를 수 있으므로 함수 안에서 양을 제한한다.
--   · 최근 1분 60건, 하루 5,000건을 넘으면 기록하지 않고 버린다.
--   · 문자열 길이와 detail 크기를 잘라 낸다.
--   · 30일이 지난 기록은 가끔(약 2%) 쓸 때 함께 지운다.

create table if not exists error_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null check (source in ('server', 'client')),
  kind text not null,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  release text
);

create index if not exists error_logs_created_idx on error_logs (created_at desc);
create index if not exists error_logs_kind_idx on error_logs (kind, created_at desc);

-- 읽기·쓰기 정책을 만들지 않는다: 앱은 아래 함수로만 쓰고, 읽기는 대시보드(서비스 권한)로만 한다.
alter table error_logs enable row level security;

create or replace function log_error(
  p_source text,
  p_kind text,
  p_message text,
  p_detail jsonb default '{}'::jsonb,
  p_release text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source not in ('server', 'client') or coalesce(p_kind, '') = '' then
    return;
  end if;

  -- 폭주하면 버린다 (공개 함수라 로그 테이블이 무한히 커지지 않게)
  if (select count(*) from error_logs where created_at > now() - interval '1 minute') >= 60 then
    return;
  end if;
  if (select count(*) from error_logs where created_at > now() - interval '1 day') >= 5000 then
    return;
  end if;

  insert into error_logs (source, kind, message, detail, release)
  values (
    p_source,
    left(p_kind, 60),
    left(coalesce(p_message, ''), 300),
    case
      when p_detail is null then '{}'::jsonb
      when pg_column_size(p_detail) > 4000 then jsonb_build_object('truncated', true)
      else p_detail
    end,
    left(p_release, 40)
  );

  if random() < 0.02 then
    delete from error_logs where created_at < now() - interval '30 days';
  end if;
end;
$$;
