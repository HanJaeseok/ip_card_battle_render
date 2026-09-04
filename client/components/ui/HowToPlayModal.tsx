'use client';

import { THRESHOLDS } from 'shared';
import { SKILL_COLOR } from '@/lib/skillInfo';
import type { Animal } from 'shared';

// ─────────────────────────────────────────────────────────────
// 이 화면은 "한 장짜리 가로 포스터"다 — 규칙을 빠짐없이 적는 문서가 아니라,
// 처음 보는 사람이 10초 안에 "아 이런 게임이구나" 하고 덮을 수 있는 안내판.
// 배치는 가로 3열: [1] / [2 위·3 아래] / [4]. 좁은 화면에서만 세로로 접힌다.
// 글씨는 크게, 문장은 짧게 — 세부 수치(장소별 확률, 배율 누적, 축제 증가 주기)는
// 일부러 싣지 않는다. 자세한 건 게임 화면 툴팁과 README가 담당한다.
// ─────────────────────────────────────────────────────────────

// public/howto/how_IPs.png — 2×2 얼굴 그리드(좌상 토끼 / 우상 양 / 좌하 호랑이 / 우하 인어).
// 한 장을 4등분해 쓰므로 background-size 200%·모서리 위치로 잘라낸다.
const FACE_POS: Record<Animal, string> = {
  rabbit: '0% 0%',
  sheep: '100% 0%',
  tiger: '0% 100%',
  mermaid: '100% 100%',
};

// public/howto/how_skills.png — 가로로 이어붙인 4컷 일러스트(양 → 토끼 → 인어 → 호랑이).
const SKILL_POS: Record<Animal, string> = {
  sheep: '0% 50%',
  rabbit: '33.3333% 50%',
  mermaid: '66.6667% 50%',
  tiger: '100% 50%',
};

// 카드 칸이 좁아 한 줄로는 글씨가 잘려서, 의미 단위가 아니라 브라우저가 임의로
// 줄바꿈하는 대신 항상 이 지점에서 줄바꿈되도록 직접 2줄로 나눠 넣는다.
const ANIMAL_NAME_LINES: Record<Animal, [string, string]> = {
  sheep: ['실용', '신양'],
  rabbit: ['상표', '토끼'],
  mermaid: ['디자', '인어'],
  tiger: ['특허', '랑이'],
};

// 포스터용 한 줄 요약 — 레벨·배율 같은 용어를 빼고 "무슨 일이 일어나는지"만 남긴다.
const SKILL_LINE: Record<Animal, string[]> = {
  sheep: ['더 뽑기'],
  rabbit: ['체력', '회복'],
  mermaid: ['효과', '더 발동'],
  tiger: ['체력', '뺏기'],
};

/** how_IPs.png에서 동물 얼굴 한 칸만 잘라 보여준다. */
function Face({ animal, size = 44 }: { animal: Animal; size?: number }) {
  return (
    <div
      className="rounded-full bg-white shrink-0"
      style={{
        width: size,
        height: size,
        backgroundImage: 'url(/howto/how_IPs.png)',
        backgroundSize: '200% 200%',
        backgroundPosition: FACE_POS[animal],
      }}
    />
  );
}

/** 번호가 붙은 포스터의 한 단계. */
function Step({
  no,
  title,
  children,
  className = '',
}: {
  no: number;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative bg-white rounded-2xl border-2 border-jungle-100 p-4 pt-7 flex flex-col ${className}`}
    >
      <span className="absolute -top-4 left-4 w-10 h-10 rounded-full bg-jungle-600 text-white text-xl font-black flex items-center justify-center border-4 border-white">
        {no}
      </span>
      <h4 className="text-xl font-black text-jungle-900 leading-snug mb-3">{title}</h4>
      {children}
    </section>
  );
}

/**
 * 승리 조건 칸의 배경 화살표. 예전에는 이 자리에 "20"과 "0"이라는 숫자를 크게 적었는데,
 * 목표 점수는 방장이 정하는 값(GameSettings.targetScore)이라 방마다 달라서 늘 맞는 숫자가
 * 아니었다 — 그래서 숫자를 지우고 "위로 다 채우면 / 아래로 다 깎으면"이라는 방향만
 * 익살스러운 화살표로 보여준다. 모서리를 굵게 둥글린 뭉툭한 화살표에 살짝 기울기를 줘서
 * 안내판처럼 딱딱해지지 않게 했다.
 */
function ChunkyArrow({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{
        opacity: 0.22,
        transform: direction === 'up' ? 'rotate(-7deg)' : 'rotate(7deg)',
      }}
    >
      <g
        transform={direction === 'down' ? 'rotate(180 50 50)' : undefined}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth="10"
        strokeLinejoin="round"
      >
        <polygon points="50,16 84,50 66,50 66,86 34,86 34,50 16,50" />
      </g>
    </svg>
  );
}

/** 스택에 쌓인 카드 한 장(중앙 스택의 실제 모습을 아주 작게 재연). */
function MiniCard({ animal, num }: { animal: Animal; num: number }) {
  return (
    <div className="w-12 h-16 rounded-md bg-white border-2 border-gray-200 flex flex-col items-center justify-center gap-0.5 py-1">
      <Face animal={animal} size={26} />
      <span className="text-base font-black text-jungle-900 leading-none">{num}</span>
    </div>
  );
}

export function HowToPlayModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-jungle-50 rounded-3xl shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 포스터 머리말 — "내 차례에 할 일은 딱 두 번"을 가장 먼저 못박는다 ── */}
        <header className="relative bg-jungle-900 text-white rounded-t-3xl px-6 py-6 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-5 text-white/50 hover:text-white text-3xl leading-none"
            aria-label="닫기"
          >
            ✕
          </button>
          <p className="text-jungle-300 text-sm font-bold tracking-widest mb-2">HOW TO PLAY</p>
          <div className="flex items-center justify-center gap-3 flex-wrap text-2xl sm:text-3xl font-black">
            <span className="bg-white text-jungle-900 rounded-2xl px-5 py-2">카드 뽑기</span>
            <span className="text-jungle-300">→</span>
            <span className="bg-white text-jungle-900 rounded-2xl px-5 py-2">행동 하기</span>
          </div>
          <p className="text-jungle-100 text-lg font-black mt-3">이 두 번이면 내 차례 끝! 🎉</p>
        </header>

        <div className="p-5 pt-8 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {/* ── 1. 장소를 고른다 ── */}
          <Step no={1} title="장소를 고른다">
            <img
              src="/howto/how_places.png"
              alt="오두막·부둣가·숲길·강가 네 장소와 각 장소에서 나오는 동물"
              className="w-full flex-1 min-h-0 object-contain rounded-xl"
            />
            <p className="text-base text-gray-700 font-bold text-center mt-3 leading-relaxed">
              장소마다 <b className="text-jungle-800">나오는 동물</b>이 달라요.
              <br />
              어디를 누를지 골라 보세요!
            </p>
          </Step>

          {/* ── 가운데 열: 2(위) / 3(아래) ── */}
          <div className="flex flex-col gap-6">
            {/* ── 2. 동물을 뽑는다 ── */}
            <Step no={2} title="짝수가 되면 우리 팀 것!">
              <div className="flex items-center justify-center gap-3 flex-wrap">
                <div className="flex items-end">
                  <MiniCard animal="rabbit" num={7} />
                  <div className="-ml-3">
                    <MiniCard animal="rabbit" num={9} />
                  </div>
                </div>
                <span className="text-3xl text-jungle-400 font-black">→</span>
                <div className="bg-jungle-600 text-white rounded-xl px-4 py-2 text-center">
                  <p className="text-xs font-bold text-jungle-200 leading-none">토끼 경험치</p>
                  <p className="text-3xl font-black leading-tight">+16</p>
                </div>
              </div>
              <p className="text-base text-gray-700 font-bold text-center mt-3 leading-relaxed">
                같은 동물이 <b className="text-jungle-800">2장, 4장…</b> 모이면
                <br />
                전부 가져가요.
                <br />
                카드 숫자를 더한 만큼 <b className="text-jungle-800">경험치</b>가 쑥!
              </p>
            </Step>

            {/* ── 3. 경험치를 모아 행동을 고른다 ── */}
            <Step no={3} title="차례 끝에 행동 하나!">
              <div className="grid grid-cols-4 gap-2">
                {(['sheep', 'rabbit', 'mermaid', 'tiger'] as Animal[]).map(animal => (
                  <div
                    key={animal}
                    className="rounded-xl overflow-hidden border-2 border-jungle-100 bg-white"
                  >
                    <div
                      className="h-16 bg-cover"
                      style={{
                        backgroundImage: 'url(/howto/how_skills.png)',
                        backgroundSize: '400% 100%',
                        backgroundPosition: SKILL_POS[animal],
                      }}
                    />
                    <div className="px-1 py-1.5 text-center">
                      <p
                        className="text-sm font-black leading-tight"
                        style={{ color: SKILL_COLOR[animal] }}
                      >
                        {ANIMAL_NAME_LINES[animal].map(line => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                      <p className="text-sm text-gray-700 font-black leading-tight mt-0.5 whitespace-nowrap">
                        {SKILL_LINE[animal].map(line => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-base text-gray-700 font-bold text-center mt-3 leading-relaxed">
                <b className="text-jungle-800">실용신안·상표 {THRESHOLDS.sheep}년!</b>
                <br />
                <b className="text-jungle-800">디자인·특허 {THRESHOLDS.mermaid}년!</b>
                <br />
                존속 기간만큼 경험치 모으기!
              </p>
            </Step>
          </div>

          {/* ── 4. 승리 ── */}
          <Step no={4} title="체력으로 승부!" className="border-bark-200">
            {/* 목표 점수는 방마다 다르므로(방장이 정한다) 숫자를 적지 않고, 배경 화살표로
                "끝까지 채우거나 / 끝까지 깎으면 이긴다"는 방향만 보여준다. */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div className="relative overflow-hidden flex-1 flex flex-col justify-center bg-jungle-600 text-white rounded-xl px-4 py-5 text-center">
                <ChunkyArrow direction="up" />
                <p className="relative text-xl font-black leading-snug">
                  내 체력을
                  <br />
                  모두 채우면 승리 🏆
                </p>
              </div>
              <div className="relative overflow-hidden flex-1 flex flex-col justify-center bg-rose-500 text-white rounded-xl px-4 py-5 text-center">
                <ChunkyArrow direction="down" />
                <p className="relative text-xl font-black leading-snug">
                  상대 체력을
                  <br />
                  다 깎아도 승리 🏆
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 bg-bark-200/50 border-2 border-bark-200 rounded-xl px-3 py-3">
              <span className="text-2xl shrink-0">🌰</span>
              <p className="text-base font-black text-bark-700 leading-snug">
                도토리 축제가 열리면
                <br />
                공짜 뽑기가 덤으로 붙습니다!
              </p>
            </div>
          </Step>

          <div className="lg:col-span-3">
            <button
              onClick={onClose}
              className="w-full bg-jungle-600 hover:bg-jungle-700 text-white font-black text-xl rounded-2xl py-4 transition-colors"
            >
              이해했어요! 🎮
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
