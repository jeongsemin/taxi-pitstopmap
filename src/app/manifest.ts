import type { MetadataRoute } from "next";

// 홈 화면에 추가했을 때 주소창 없이 앱처럼 열리게 하는 설정.
// 배경·테마 색은 라이트 테마 기준 (앱 안의 화면은 설정한 테마를 따른다).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "택시 쉼터 지도",
    short_name: "쉼터지도",
    description: "택시 기사를 위한 주정차 가능 식당·화장실 안내",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ko",
    background_color: "#ffffff",
    theme_color: "#fee500",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
