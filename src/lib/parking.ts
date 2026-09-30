export type ParkingLevel = "good" | "unsure" | "hard";

export type ParkingScore = {
  score: number;
  nearestLotDistance: number | null;
  nearestLotName: string | null;
  reasons: string[];
};

// 🟢 60 이상 / 🟡 30~59 / 🔴 30 미만 (규칙은 supabase/migrations/0002 참고)
export function parkingLevel(score: number): ParkingLevel {
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
};
