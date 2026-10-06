-- 위치정보 이용 동의 기록.
--
-- 누가 어떤 문구(버전)에 언제 동의·거부·철회했는지를 남겨 두는 기록이다.
-- 앱에 로그인이 없어서 사람을 식별하지 않고, 브라우저가 만든 무작위 번호(consent_id)만 저장한다.
-- IP, 위치, 계정은 저장하지 않는다. 동의의 증빙이라 오류 기록과 달리 자동으로 지우지 않는다.
--
-- 공개된 anon 키로 누구나 log_consent() 를 부를 수 있으므로 함수 안에서 형식과 양을 제한한다.

create table if not exists consent_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  consent_id uuid not null,
  version text not null,
  action text not null check (action in ('granted', 'declined', 'withdrawn'))
);

create index if not exists consent_logs_created_idx on consent_logs (created_at desc);
create index if not exists consent_logs_consent_idx on consent_logs (consent_id, created_at desc);

-- 읽기·쓰기 정책을 만들지 않는다: 앱은 아래 함수로만 쓰고, 읽기는 대시보드(서비스 권한)로만 한다.
alter table consent_logs enable row level security;

create or replace function log_consent(
  p_consent_id uuid,
  p_version text,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_consent_id is null or p_action not in ('granted', 'declined', 'withdrawn') then
    return;
  end if;
  if coalesce(p_version, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return;
  end if;

  -- 폭주하면 버린다 (공개 함수라 테이블이 무한히 커지지 않게)
  if (select count(*) from consent_logs where created_at > now() - interval '1 minute') >= 120 then
    return;
  end if;
  if (select count(*) from consent_logs where created_at > now() - interval '1 day') >= 20000 then
    return;
  end if;

  insert into consent_logs (consent_id, version, action)
  values (p_consent_id, p_version, p_action);
end;
$$;
