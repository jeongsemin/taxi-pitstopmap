import { CategoryIcon, StatusPill, isOpen24h } from "@/components/ui";
import type { Place } from "@/types/place";

type Props = {
  place: Place;
  onClick: () => void;
};

function subtitle(place: Place) {
  return [place.category, isOpen24h(place) ? "24시간" : null]
    .filter(Boolean)
    .join(" · ");
}

export function reasonText(place: Place) {
  if (place.parking.score === null) {
    return place.parking.noData
      ? "주차장 데이터가 없는 지역"
      : "점수를 불러오지 못했어요";
  }
  const { storeParking, roadside, reports } = place.parking;
  if (reports.enforced > 0) return `단속 제보 ${reports.enforced}명`;
  if (storeParking.kind === "reported") return "주차 자리 제공 제보";
  if (storeParking.kind === "name_match") return "주차 자리 제공 추정";
  if (storeParking.kind === "building") return "건물·옆 주차장 (추정)";
  if (roadside) return `노상주차장 ${roadside.distance}m`;
  return "주차 정보 없음";
}

export default function PlaceCard({ place, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="flex w-full flex-col gap-3.5 overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left"
    >
      <div className="flex w-full items-center gap-3">
        <CategoryIcon place={place} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-lg leading-tight font-extrabold text-fg">
            {place.name}
          </p>
          <p className="truncate text-sm font-semibold text-muted">
            {subtitle(place)}
          </p>
        </div>
        <p className="shrink-0 text-lg font-extrabold text-fg">
          {place.distance}m
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2">
        <StatusPill score={place.parking.score} />
        <span className="rounded-full bg-chip px-2.5 py-1.5 text-xs font-bold text-muted">
          {reasonText(place)}
        </span>
      </div>
    </button>
  );
}
