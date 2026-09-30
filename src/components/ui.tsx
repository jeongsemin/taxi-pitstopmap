import { Toilet, Utensils, type LucideIcon } from "lucide-react";
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
          ? "border-brand bg-brand text-ink"
          : "border-line bg-raised text-fg"
      }`}
    >
      {Icon && <Icon size={18} aria-hidden />}
      {label}
      <span
        className={`text-xs font-bold ${active ? "text-brand-deep" : "text-faint"}`}
      >
        {count}
      </span>
    </button>
  );
}
