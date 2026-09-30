"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

export const RADIUS_OPTIONS = [500, 1000, 1500, 2000];

export function radiusLabel(r: number) {
  return r >= 1000 ? `${r / 1000}km` : `${r}m`;
}

type Props = {
  radius: number;
  onChange: (r: number) => void;
};

// 슬라이더 아이콘 버튼을 누르면 검색 반경을 고르는 작은 메뉴가 열린다.
export default function RadiusMenu({ radius, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`검색 반경 ${radiusLabel(radius)}`}
        aria-expanded={open}
        className="flex h-[52px] min-w-[52px] items-center justify-center gap-1.5 rounded-2xl bg-raised px-3.5 text-sm font-extrabold shadow-[0_12px_28px_rgba(0,0,0,0.4)]"
      >
        <SlidersHorizontal size={22} aria-hidden />
        <span className="text-accent">{radiusLabel(radius)}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-14 z-20 w-36 overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_12px_28px_rgba(0,0,0,0.5)]"
        >
          <p className="px-4 pt-3 pb-1 text-xs font-bold text-muted">
            검색 반경
          </p>
          {RADIUS_OPTIONS.map((r) => (
            <button
              key={r}
              role="menuitemradio"
              aria-checked={r === radius}
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`flex h-12 w-full items-center px-4 text-base font-extrabold ${
                r === radius ? "text-accent" : "text-fg"
              }`}
            >
              {radiusLabel(r)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
