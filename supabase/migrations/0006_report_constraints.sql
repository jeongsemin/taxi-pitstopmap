-- 제보 입력 검증 (어뷰징 대응).
-- 공개된 anon 키로 앱을 거치지 않고 Supabase REST 에 바로 insert 할 수 있으므로,
-- 앱이 보내는 값의 형식을 DB 가 직접 강제한다.
-- not valid: 이미 들어 있는 행은 검사하지 않고, 앞으로 들어오는 행부터 적용한다.

-- 장소 id 는 API 가 내려주는 형식("kakao-123", "db-45")만 허용
alter table reports drop constraint if exists reports_place_key_format;
alter table reports
  add constraint reports_place_key_format
  check (place_key ~ '^(kakao|db)-[0-9]{1,20}$') not valid;

-- 장소 이름 길이 제한 (비어 있거나 너무 긴 값 금지)
alter table reports drop constraint if exists reports_place_name_length;
alter table reports
  add constraint reports_place_name_length
  check (char_length(place_name) between 1 and 100) not valid;

-- 좌표는 서비스 지역(대한민국) 안
alter table reports drop constraint if exists reports_location_in_korea;
alter table reports
  add constraint reports_location_in_korea
  check (lat between 33 and 39 and lng between 124 and 132) not valid;

-- 자유 입력(content)은 현재 화면에서 쓰지 않는다. 쓰더라도 짧게만 허용
alter table reports drop constraint if exists reports_content_length;
alter table reports
  add constraint reports_content_length
  check (content is null or char_length(content) <= 200) not valid;
