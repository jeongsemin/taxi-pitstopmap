import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "개인정보·위치정보 안내",
  description: "쉼터지도가 위치와 제보 정보를 어떻게 쓰는지 안내합니다.",
};

// 이 안내는 앱이 실제로 하는 일을 그대로 적은 것이다. 동작이 바뀌면 이 글도 함께 고친다.
const UPDATED = "2026년 10월 6일";
const CONTACT_URL = "https://github.com/jeongsemin/taxi-pitstopmap/issues";

type Section = { title: string; body: (string | string[])[] };

const SECTIONS: Section[] = [
  {
    title: "내 위치는 이렇게 써요",
    body: [
      [
        "앱을 열 때와 ‘현재 위치’ 버튼을 누를 때, 휴대폰에 위치를 한 번 물어봐요. 계속 따라다니며 추적하지 않아요.",
        "위치는 내 주변 식당·화장실을 찾는 데만 써요. 광고나 다른 목적에는 쓰지 않아요.",
        "위치를 허용하지 않아도 앱을 쓸 수 있어요. 이때는 강남역 기준으로 보여 드려요.",
        "서버로 보내는 좌표는 약 10m 단위로 뭉뚱그려서 보내요. 주변 장소를 찾아 돌려드린 뒤에는 우리 데이터베이스에 저장하지 않아요.",
      ],
      "위치 권한은 휴대폰이나 브라우저의 설정에서 언제든 끌 수 있어요.",
    ],
  },
  {
    title: "제보하면 저장되는 정보",
    body: [
      "제보 버튼을 처음 누르면 이메일이나 전화번호 없이 익명 계정이 자동으로 만들어져요. 무작위 번호일 뿐이라 누구인지 알 수 없어요.",
      [
        "저장되는 것: 익명 번호, 제보한 장소(이름·위치), 제보 종류, 제보한 시각",
        "저장되지 않는 것: 제보할 때 내가 있던 위치, 이름, 연락처",
      ],
      "다른 사용자에게는 누가 제보했는지 보이지 않고, ‘제보 몇 명’ 같은 숫자만 보여요.",
      "점수에는 최근 30일 안의 제보만 반영돼요. 제보 기록 자체는 지금은 자동으로 지워지지 않고, 앱에서 직접 지우는 기능도 아직 없어요. 지우고 싶으면 아래 문의로 알려 주세요.",
      "브라우저의 사이트 데이터를 지우거나 다른 폰으로 옮기면 새 익명 계정이 돼요. 이전 제보와는 이어지지 않아요.",
    ],
  },
  {
    title: "오류 기록",
    body: [
      "앱이 잘 동작하는지 확인하려고 오류가 났을 때만 기록해요.",
      [
        "기록되는 것: 오류 내용, 화면 경로, 브라우저 종류 일부, 앱 버전",
        "기록되지 않는 것: 내 위치, IP 주소, 익명 계정 번호",
      ],
      "오류 기록은 30일이 지나면 지워져요.",
    ],
  },
  {
    title: "내 휴대폰에 저장되는 것",
    body: [
      "화면 테마 설정, 그리고 제보할 때 만들어지는 익명 로그인 정보가 이 브라우저(또는 설치한 앱)에 저장돼요.",
      "쉼터지도는 방문자를 분석하거나 광고하는 도구를 쓰지 않고, 따로 쿠키를 만들지 않아요. 다만 아래 외부 서비스는 각자의 방식으로 접속 정보를 처리할 수 있어요.",
    ],
  },
  {
    title: "함께 쓰는 외부 서비스",
    body: [
      [
        "카카오: 지도 표시와 주변 식당 검색. 검색할 때 뭉뚱그린 좌표가 전달돼요.",
        "Supabase: 화장실·주차장 데이터와 제보, 오류 기록 저장. 주변 검색을 위해 뭉뚱그린 좌표가 전달되지만 앱 데이터로는 저장하지 않아요.",
        "Vercel: 이 앱을 인터넷에 올려 두는 서비스. 일반적인 접속 기록에 요청 주소(좌표 포함)가 일정 기간 남을 수 있어요. 운영자가 따로 열람하거나 저장하지 않아요.",
      ],
      "각 서비스의 정책은 해당 회사의 안내를 따라요.",
    ],
  },
  {
    title: "문의",
    body: [
      "제보 삭제나 개인정보에 대한 문의는 아래 주소로 남겨 주세요.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl bg-ink px-5 pt-4 pb-12 break-keep">
      <Link
        href="/"
        aria-label="지도로 돌아가기"
        className="flex size-[39px] items-center justify-center rounded-xl bg-raised"
      >
        <ArrowLeft size={17} aria-hidden />
      </Link>

      <h1 className="mt-5 text-[26px] leading-tight text-fg">
        개인정보·위치정보 안내
      </h1>
      <p className="mt-1 text-sm font-medium text-muted">
        쉼터지도가 실제로 하는 일을 그대로 적었어요. · 최종 수정 {UPDATED}
      </p>

      <div className="mt-6 space-y-7">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-extrabold text-fg">{section.title}</h2>
            <div className="mt-2 space-y-2.5 text-[15px] leading-relaxed text-fg/90">
              {section.body.map((block, i) =>
                Array.isArray(block) ? (
                  <ul key={i} className="list-disc space-y-1.5 pl-5">
                    {block.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={i}>{block}</p>
                ),
              )}
              {section.title === "문의" && (
                <p>
                  <a
                    href={CONTACT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-accent underline"
                  >
                    문의 남기기 (GitHub)
                  </a>
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
