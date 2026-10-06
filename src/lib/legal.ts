// 위치정보 이용 동의와 안내 화면이 함께 쓰는 값. 동의 문구를 바꾸면 버전을 올려야 모두에게 다시 동의를 받는다.

export const SERVICE_NAME = "쉼터지도";
export const CONTACT_URL = "https://github.com/jeongsemin/taxi-pitstopmap/issues";

// 동의 문구(약관) 버전. 내용이 바뀌면 값을 바꾼다. 저장된 동의의 버전이 다르면 다시 동의를 받는다.
export const LOCATION_CONSENT_VERSION = "2026-10-06";

export const CONSENT_UPDATED_LABEL = "2026년 10월 6일";

// 동의 화면에 보여 주는 항목. 법에서 이용약관에 밝히도록 한 내용(수집 목적, 이용·보유 기간,
// 제3자 제공, 동의 거부 시 불이익, 철회 방법)을 항목별로 나눠 적는다.
export const LOCATION_CONSENT_ITEMS: { label: string; text: string }[] = [
  {
    label: "수집하는 위치정보",
    text: "휴대폰의 현재 위치(위도·경도)를 한 번 읽어요. 계속 따라다니며 추적하지 않아요.",
  },
  {
    label: "이용 목적",
    text: "내 주변 식당·화장실을 찾고, 지도에 내 위치를 표시하는 데만 써요.",
  },
  {
    label: "이용·보유 기간",
    text: "저장하지 않아요. 주변 장소를 찾아 돌려드린 뒤에는 남기지 않아요. 다만 이 앱을 올려 둔 호스팅 서비스(Vercel)의 일반적인 접속 기록에 요청 주소가 일정 기간 남을 수 있어요.",
  },
  {
    label: "제3자 제공",
    text: "검색을 위해 약 10m 단위로 뭉뚱그린 좌표가 카카오(지도·식당 검색)와 Supabase(화장실·주차장 검색)에 전달돼요.",
  },
  {
    label: "동의하지 않으면",
    text: "위치 없이 강남역 기준으로 앱을 계속 쓸 수 있어요. 주변 검색이 내 위치가 아니라 강남역 주변으로 보여요.",
  },
  {
    label: "동의 철회",
    text: "설정 → 위치정보 이용 동의에서 언제든 철회할 수 있어요. 철회하면 더 이상 내 위치를 읽지 않아요.",
  },
];
