export type ParkingLevel = "good" | "unsure" | "hard" | "unknown";

// score 가 null 이면 점수가 없는 것이다.
//  - noData: 주차장 데이터가 없는 지역이라 알 수 없음 ("세울 수 없음"이 아니다)
//  - noData 가 false 면 점수 조회에 실패한 경우
// 주차 자리 제공 유무(가게·시설이 손님에게 주차 자리를 내주는가):
//  reported   제보로 확인됨 / name_match 이름이 같은 주차장이 있음(추정)
//  building   같은 건물이거나 바로 옆 주차장이 있음(추정) / none 근거 없음
export type StoreParkingKind = "reported" | "name_match" | "building" | "none";

export type ParkingScore = {
  score: number | null;
  noData: boolean;
  nearestLotDistance: number | null;
  nearestLotName: string | null;
  reasons: string[];
  storeParking: { kind: StoreParkingKind; lotName: string | null };
  // 100m 안의 노상주차장(도로에 그어진 주차구획). 없으면 null
  roadside: { distance: number; name: string | null } | null;
  reports: { store: number; roadside: number; enforced: number; full: number };
};

// 점수를 아직 붙이지 못한 장소의 기본값 (점수 조회에 실패하면 그대로 남는다)
export const EMPTY_PARKING_SCORE: ParkingScore = {
  score: null,
  noData: false,
  nearestLotDistance: null,
  nearestLotName: null,
  reasons: [],
  storeParking: { kind: "none", lotName: null },
  roadside: null,
  reports: { store: 0, roadside: 0, enforced: 0, full: 0 },
};

// 주차 자리 제공이나 도로변 주차의 근거가 있는 장소(🟡 이상). "주차 가능" 필터가 쓴다.
export function isParkable(score: number | null): boolean {
  return score !== null && score >= 30;
}

// 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만 (규칙은 supabase/migrations/0008 참고)
export function parkingLevel(score: number | null): ParkingLevel {
  if (score === null) return "unknown";
  if (score >= 60) return "good";
  if (score >= 30) return "unsure";
  return "hard";
}

// color: 지도 마커용 hex, text/tint: Tailwind 클래스 (globals.css 의 색상 토큰)
export const LEVEL_STYLE: Record<
  ParkingLevel,
  { color: string; label: string; text: string; tint: string }
> = {
  good: {
    color: "#39e58c",
    label: "주정차 가능",
    text: "text-good",
    tint: "bg-good/12",
  },
  unsure: {
    color: "#ffb547",
    label: "불확실",
    text: "text-warn",
    tint: "bg-warn/12",
  },
  hard: {
    color: "#ff5d66",
    label: "어려움",
    text: "text-bad",
    tint: "bg-bad/12",
  },
  unknown: {
    color: "#6f7c8d",
    label: "점수 없음",
    text: "text-faint",
    tint: "bg-faint/15",
  },
};
