import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SoundToggle } from "@/components/ui/SoundToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: '한국특허정보원 카드배틀',
  description: '🐑🐰🧜‍♀️🐯 실용신양·상표토끼·디자인어·특허랑이 팀 대전 카드 게임',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning은 아래 인라인 스크립트 때문에 반드시 필요하다 — 그 스크립트가
    // 하이드레이션 전에 <html>에 style="--font-scale:…"을 심는데, 서버가 그린 HTML에는 그
    // 속성이 없다(저장된 값은 localStorage에만 있으므로 서버가 미리 알 수 없다). React는 이
    // 차이를 mismatch로 보고 경고하지만, 여기서는 의도된 차이다. 이 속성 하나에만 적용되고
    // 자식 트리의 하이드레이션 검사는 그대로 유지된다.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* 저장된 글씨 크기를 첫 페인트 전에 적용한다 — React가 붙은 뒤에 적용하면
            기본 크기로 한 번 그려졌다가 바뀌는 깜빡임이 보인다.
            배열과 기본값(4)은 lib/uiSettings.ts의 FONT_SCALE_STEPS/DEFAULT_FONT_STEP과
            같아야 한다 — 이 파일은 순수 문자열이라 그쪽 상수를 import해서 쓸 수 없다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=[0.85,0.92,1,1.12,1.25,1.4,1.55][(+localStorage.getItem('cardBattle_fontStep')||4)-1];if(s)document.documentElement.style.setProperty('--font-scale',s)}catch(e){}`,
          }}
        />
        {children}
        <SoundToggle />
      </body>
    </html>
  );
}
