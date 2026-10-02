"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, SquareParking, Toilet, Utensils } from "lucide-react";
import { FilterPill } from "@/components/ui";
import type { PlaceType } from "@/types/place";

export type Filter = "all" | PlaceType;

export type FilterCounts = {
  all: number;
  restaurant: number;
  toilet: number;
  parkable: number;
};

type Props = {
  counts: FilterCounts;
  filter: Filter;
  onFilter: (f: Filter) => void;
  parkableOnly: boolean;
  onParkableOnly: (v: boolean) => void;
};

// 마우스로 끌었는지 판단하는 최소 거리(px). 이보다 적게 움직이면 클릭으로 본다.
const DRAG_THRESHOLD = 5;

// 오른쪽 끝 20px 를 점점 투명하게 (어떤 배경 위에서도 쓸 수 있는 마스크 방식)
const FADE_RIGHT: React.CSSProperties = {
  maskImage: "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
  WebkitMaskImage:
    "linear-gradient(to right, #000 calc(100% - 20px), transparent)",
};

// 종류 버튼은 선택된 상태에서 다시 누르면 해제되고, 아무것도 선택하지 않은 상태는 "전체"다.
// 화면보다 버튼이 길면 옆으로 밀어서 고른다(터치 스와이프, 마우스 드래그).
// 오른쪽에 더 있으면 끝을 흐리게 하고 다음 버튼이 살짝 보여서 밀 수 있다는 것을 알려 준다.
export default function FilterBar({
  counts,
  filter,
  onFilter,
  parkableOnly,
  onParkableOnly,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });
  // 오른쪽에 더 보이지 않는 버튼이 있는지 (있으면 오른쪽 끝을 흐리게 한다)
  const [hasMore, setHasMore] = useState(false);

  const updateHasMore = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHasMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateHasMore();
    window.addEventListener("resize", updateHasMore);
    return () => window.removeEventListener("resize", updateHasMore);
  }, [updateHasMore, counts]);

  // 마우스 드래그 스크롤 (터치는 브라우저가 기본으로 처리한다)
  const onMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el || e.button !== 0) return;
    drag.current = {
      active: true,
      startX: e.clientX,
      startLeft: el.scrollLeft,
      moved: false,
    };
    const onMove = (ev: MouseEvent) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = ev.clientX - d.startX;
      if (Math.abs(dx) > DRAG_THRESHOLD) d.moved = true;
      if (d.moved) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      drag.current.active = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 끌고 난 뒤에는 버튼이 눌린 것으로 처리하지 않는다
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  };

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={updateHasMore}
        onMouseDown={onMouseDown}
        onClickCapture={onClickCapture}
        style={hasMore ? FADE_RIGHT : undefined}
        className="no-scrollbar flex cursor-grab gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-1.5 [touch-action:pan-x] active:cursor-grabbing"
      >
        <FilterPill
          active={filter === "all"}
          onClick={() => onFilter("all")}
          icon={MapPin}
          label="전체"
          count={counts.all}
        />
        <FilterPill
          active={filter === "restaurant"}
          onClick={() =>
            onFilter(filter === "restaurant" ? "all" : "restaurant")
          }
          icon={Utensils}
          label="식당"
          count={counts.restaurant}
        />
        <FilterPill
          active={filter === "toilet"}
          onClick={() => onFilter(filter === "toilet" ? "all" : "toilet")}
          icon={Toilet}
          label="화장실"
          count={counts.toilet}
        />
        <FilterPill
          active={parkableOnly}
          onClick={() => onParkableOnly(!parkableOnly)}
          icon={SquareParking}
          label="주차 가능"
          count={counts.parkable}
        />
      </div>
    </div>
  );
}
