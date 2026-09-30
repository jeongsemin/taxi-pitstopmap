export type ParkingLevel = "good" | "unsure" | "hard" | "unknown";

// score 가 null 이면 점수를 계산하지 못한 것 (점수 조회 실패)
export type ParkingScore = {
  score: number | null;
  nearestLotDistance: number | null;
  nearestLotName: string | null;
  reasons: string[];
  reports: { parkable: number; enforced: number; full: number };
};

// 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만 (규칙은 supabase/migrations/0004 참고)
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
