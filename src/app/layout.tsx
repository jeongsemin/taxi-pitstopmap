import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "taxi-pitstopmap",
  description: "택시 기사를 위한 주정차 가능 식당·화장실 안내",
  icons: { apple: "/apple-icon.png" },
  // iOS 홈 화면에 추가했을 때 앱처럼 열린다 (안드로이드는 manifest 사용)
  appleWebApp: { capable: true, title: "쉼터지도", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#070b12" },
  ],
};

// 첫 페인트 전에 저장된 테마 설정(없으면 기기 설정)을 적용해 화면 깜빡임을 막는다.
// 규칙은 src/lib/theme.tsx 와 같아야 한다.
const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("theme-pref");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=p==="light"||p==="dark"?p:(d?"dark":"light")}catch(e){document.documentElement.dataset.theme="dark"}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
