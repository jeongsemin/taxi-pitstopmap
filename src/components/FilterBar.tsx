"use client";

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

export default function FilterBar({
  counts,
  filter,
  onFilter,
  parkableOnly,
  onParkableOnly,
}: Props) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-1.5">
      <FilterPill
        active={filter === "all"}
        onClick={() => onFilter("all")}
        icon={MapPin}
        label="전체"
        count={counts.all}
      />
      <FilterPill
        active={filter === "restaurant"}
        onClick={() => onFilter("restaurant")}
        icon={Utensils}
        label="식당"
        count={counts.restaurant}
      />
      <FilterPill
        active={filter === "toilet"}
        onClick={() => onFilter("toilet")}
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
  );
}
