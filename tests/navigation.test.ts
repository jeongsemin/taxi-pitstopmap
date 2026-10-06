import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kakaoMapUrl,
  naverMapUrl,
  naverMapWebUrl,
  tmapUrl,
} from "@/lib/navigation";

const place = { name: "맛집 & 카페(본점)", lat: 37.4979, lng: 127.0276 };

test("카카오맵: 이름은 인코딩하고 좌표는 위도,경도 순서다", () => {
  const url = kakaoMapUrl(place);
  assert.ok(url.startsWith("https://map.kakao.com/link/to/"));
  assert.ok(url.endsWith(`,${place.lat},${place.lng}`));
  assert.ok(url.includes(encodeURIComponent(place.name)));
  assert.ok(!url.includes(" "), "공백이 그대로 들어가면 안 된다");
});

test("네이버 지도: 앱 주소에 위도(dlat)·경도(dlng)·이름·appname 이 들어간다", () => {
  const u = new URL(naverMapUrl(place));
  assert.equal(u.protocol, "nmap:");
  assert.equal(u.searchParams.get("dlat"), String(place.lat));
  assert.equal(u.searchParams.get("dlng"), String(place.lng));
  assert.equal(u.searchParams.get("dname"), place.name);
  assert.equal(u.searchParams.get("appname"), "taxi-pitstopmap");
});

test("네이버 지도 웹 주소는 이름 검색이고 특수문자를 인코딩한다", () => {
  const url = naverMapWebUrl(place);
  assert.ok(url.startsWith("https://map.naver.com/p/search/"));
  assert.ok(!url.includes("&"), "& 가 그대로 있으면 주소가 깨진다");
});

test("T맵: 경도(goalx)와 위도(goaly)가 뒤바뀌지 않는다", () => {
  const u = new URL(tmapUrl(place));
  assert.equal(u.protocol, "tmap:");
  assert.equal(u.searchParams.get("goalx"), String(place.lng));
  assert.equal(u.searchParams.get("goaly"), String(place.lat));
  assert.equal(u.searchParams.get("goalname"), place.name);
});
