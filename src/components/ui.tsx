import { Info, Toilet, Utensils, type LucideIcon } from "lucide-react";
import { LEVEL_STYLE, parkingLevel } from "@/lib/parking";
import type { Place, PlaceType } from "@/types/place";

export const TYPE_ICON: Record<PlaceType, LucideIcon> = {
  restaurant: Utensils,
  toilet: Toilet,
};

export function StatusPill({
  score,
  size = "sm",
}: {
  score: number | null;
  size?: "sm" | "lg";
}) {
  const style = LEVEL_STYLE[parkingLevel(score)];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 rounded-full font-extrabold ${style.tint} ${style.text} ${
        size === "lg" ? "px-3.5 py-2.5 text-base" : "px-2.5 py-1.5 text-xs"
      }`}
    >
      <span
        className={`rounded-full bg-current ${size === "lg" ? "size-2.5" : "size-2"}`}
      />
      {style.label}
    </span>
  );
}

export function CategoryIcon({
  place,
  size = 46,
}: {
  place: Pick<Place, "type" | "parking">;
  size?: number;
}) {
  const style = LEVEL_STYLE[parkingLevel(place.parking.score)];
  const Icon = TYPE_ICON[place.type];
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-[10px] ${style.tint} ${style.text}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.52)} aria-hidden />
    </div>
  );
}

export function isOpen24h(place: Pick<Place, "is24h" | "openHours">) {
  return place.is24h || place.openHours === "24시간";
}

// 보이는 장소가 모두 "주차장 데이터 없는 지역"일 때의 안내.
// 데이터가 없는 것은 "세울 수 없음"과 다르다는 점을 알려 점수 없음(회색)을 오해하지 않게 한다.
export function NoDataNotice({ places }: { places: Pick<Place, "parking">[] }) {
  if (places.length === 0 || !places.every((p) => p.parking.noData))
    return null;
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs font-semibold text-muted shadow-[0_12px_28px_rgba(0,0,0,0.25)]"
    >
      <Info size={16} className="mt-px shrink-0 text-accent" aria-hidden />
      <p>
        이 지역은 주차장 데이터가 아직 없어 주정차 점수를 알 수 없어요. 현재
        서울 강남구만 지원해요. 회색 마커는 &quot;세울 수 없음&quot;이 아니라
        정보 없음이에요.
      </p>
    </div>
  );
}

export function FilterPill({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-11 shrink-0 items-center gap-[7px] rounded-full border px-3.5 text-sm font-extrabold whitespace-nowrap ${
        active
          ? "border-brand bg-brand text-on-brand"
          : "border-line bg-raised text-fg"
      }`}
    >
      {Icon && <Icon size={18} aria-hidden />}
      {label}
      <span
        className={`text-xs font-bold ${active ? "text-on-brand/70" : "text-faint"}`}
      >
        {count}
      </span>
    </button>
  );
}
