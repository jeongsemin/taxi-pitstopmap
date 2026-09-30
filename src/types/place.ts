import type { ParkingScore } from "@/lib/parking";

export type PlaceType = "restaurant" | "toilet";

export type Place = {
  id: string;
  type: PlaceType;
  name: string;
  category: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
  distance: number;
  url: string;
  parking: ParkingScore;
};
