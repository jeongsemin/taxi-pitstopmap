import { List, Map, type LucideIcon } from "lucide-react";

export type Tab = "map" | "list";

const ITEMS: { value: Tab; label: string; icon: LucideIcon }[] = [
  { value: "map", label: "지도", icon: Map },
  { value: "list", label: "목록", icon: List },
];

export default function BottomNav({
  tab,
  onChange,
}: {
  tab: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav
      aria-label="화면 전환"
      className="flex h-[76px] shrink-0 items-start justify-center gap-2 border-t border-line bg-surface px-4 pt-2.5 pb-3"
    >
      {ITEMS.map(({ value, label, icon: Icon }) => {
        const active = tab === value;
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            aria-current={active ? "page" : undefined}
            className={`flex h-[54px] w-24 flex-col items-center justify-center gap-1 rounded-[10px] text-xs ${
              active
                ? "bg-brand-deep font-extrabold text-brand"
                : "font-semibold text-faint"
            }`}
          >
            <Icon size={22} aria-hidden />
            {label}
          </button>
        );
      })}
    </nav>
  );
}
