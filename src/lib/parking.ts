export type ParkingLevel = "good" | "unsure" | "hard" | "unknown";

// score 가 null 이면 점수를 계산하지 못한 것 (점수 조회 실패)
export type ParkingScore = {
  score: number | null;
  nearestLotDistance: number | null;
  nearestLotName: string | null;
  reasons: string[];
};

// 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만 (규칙은 supabase/migrations/0002 참고)
export function parkingLevel(score: number | null): ParkingLevel {
  if (score === null) return "unknown";
  if (score >= 60) return "good";
  if (score >= 30) return "unsure";
  return "hard";
}

export const LEVEL_STYLE: Record<
  ParkingLevel,
  { color: string; dot: string; label: string }
> = {
  good: { color: "#16a34a", dot: "🟢", label: "주정차 가능" },
  unsure: { color: "#eab308", dot: "🟡", label: "불확실" },
  hard: { color: "#dc2626", dot: "🔴", label: "어려움" },
  unknown: { color: "#9ca3af", dot: "⚪", label: "점수 없음" },
};
