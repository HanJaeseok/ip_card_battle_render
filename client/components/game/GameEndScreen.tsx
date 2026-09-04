'use client';

import { useMemo } from 'react';
import type { Animal, ClientGameState, Team } from 'shared';
import { ANIMALS, LOSE_HP } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';

const FLAVOR_TEXT: Record<Animal, string> = {
  sheep: '실용신안의 실리주의로 판을 키우셨군요!',
  rabbit: '상표의 가치를 꾸준히 쌓아 체력을 채우셨군요!',
  mermaid: '디자인권의 배율로 판을 뒤집으셨군요!',
  tiger: '가장 강력한 독점권으로 상대를 밀어붙이셨군요!',
};

/** 승리팀이 체력을 가장 많이 벌어들인 동물(행동)을 판정한다. */
function pickFlavorAnimal(gameState: ClientGameState, winner: Team | 'draw' | null): Animal | null {
  if (winner !== 'A' && winner !== 'B') return null;

  let best: Animal | null = null;
  let bestGain = 0;
  for (const a of ANIMALS) {
    const gain = gameState.teams[winner].skillStats[a].totalHpGained;
    if (gain > bestGain) {
      bestGain = gain;
      best = a;
    }
  }
  return best;
}

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  dur: number;
  delay: number;
  rot: number;
}

function generateConfetti(count: number, teamColor: string): ConfettiPiece[] {
  const palette =
    teamColor === 'A'
      ? ['#22c55e', '#86efac', '#bbf7d0', '#4ade80', '#fbbf24']
      : ['#3b82f6', '#93c5fd', '#bfdbfe', '#60a5fa', '#a78bfa'];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i * 7 + 13) % 95 + 2, // 2-97 vw
    color: palette[i % palette.length],
    dur: 1600 + ((i * 137) % 800),
    delay: (i * 60) % 1000,
    rot: 360 + ((i * 73) % 360),
  }));
}

export function GameEndScreen({
  gameState,
  myTeam,
  onBack,
}: {
  gameState: ClientGameState;
  myTeam: Team | null;
  onBack: () => void;
}) {
  const { winner } = gameState;
  const hpA = gameState.teams.A.hp;
  const hpB = gameState.teams.B.hp;
  const winHp = gameState.settings.targetScore * 2;
  const isKnockout = hpA >= winHp || hpB >= winHp || hpA <= LOSE_HP || hpB <= LOSE_HP;
  const reasonText = isKnockout ? '체력 즉시 승부 — GAME OVER!' : '제한 턴 종료 — 체력 비교';

  const confetti = useMemo(
    () => (winner && winner !== 'draw' ? generateConfetti(45, winner) : []),
    [winner],
  );

  const winnerEmoji = winner === 'draw' ? '🤝' : winner === 'A' ? '🟢' : '🔵';
  // 관전자(myTeam === null)에게는 "우리팀"이 없다 — 예전엔 그 경우가 그대로 "우리팀
  // 패배!"로 떨어져 이긴 팀을 구경하고도 패배 문구를 보게 됐다.
  const winnerText =
    winner !== 'A' && winner !== 'B'
      ? '무승부!'
      : myTeam === null
        ? `${gameState.teamNames[winner]} 승리!`
        : winner === myTeam
          ? '우리팀 승리!'
          : '우리팀 패배!';
  const flavorAnimal = useMemo(() => pickFlavorAnimal(gameState, winner), [gameState, winner]);

  return (
    <div className="min-h-screen bg-jungle-50 flex flex-col items-center p-8 overflow-hidden relative">
      {/* 아래 콘텐츠 묶음은 그대로 세로 중앙 정렬하고, 그 밖에 화면 맨 밑에 붙는 푸터
          안내를 별도로 둔다 — 바깥 div를 justify-center로 두면 푸터까지 그 중앙 정렬
          묶음에 끼어버려 화면 아래쪽에 붙지 않는다. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
      {/* 컨페티 */}
      {confetti.map(c => (
        <span
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.x}vw`,
            top: '-20px',
            backgroundColor: c.color,
            '--cf-dur': `${c.dur}ms`,
            '--cf-delay': `${c.delay}ms`,
            '--cf-rot': `${c.rot}deg`,
          } as React.CSSProperties}
        />
      ))}

      {/* 승리 텍스트 */}
      <div className="winner-bounce-in flex flex-col items-center gap-3">
        <div style={{ fontSize: '5rem' }}>{winnerEmoji}</div>
        <h2 className="text-3xl font-bold text-jungle-900">{winnerText}</h2>
        <p className="text-xs font-semibold text-jungle-400 -mt-1">{reasonText}</p>
        {flavorAnimal && (
          <p className="text-sm text-jungle-500 -mt-1">{FLAVOR_TEXT[flavorAnimal]}</p>
        )}
      </div>

      {/* 체력표 */}
      <div
        className="bg-white rounded-2xl shadow-lg border border-jungle-200 p-7 w-full max-w-2xl"
        style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 200ms both' }}
      >
        {/* 팀 이름과 체력을 한 줄에 붙여 쓰면 이름이 조금만 길어도 줄바꿈되므로,
            좌우 두 칸으로 나눈 뒤 이름 아래에 체력을 따로 크게 적는다. */}
        <div className="grid grid-cols-2 gap-6 mb-1">
          {(['A', 'B'] as const).map(t => (
            <div
              key={t}
              className={`text-center ${t === 'A' ? 'text-team-a' : 'text-team-b'} ${
                winner === t ? '' : 'opacity-60'
              }`}
            >
              <p
                className={`text-lg font-bold truncate ${
                  winner === t ? 'underline decoration-2 underline-offset-4' : ''
                }`}
              >
                {t === 'A' ? '🟢' : '🔵'} {gameState.teamNames[t]}
              </p>
              <p className="text-sm font-semibold">
                체력 <span className="text-2xl font-bold tabular-nums">{t === 'A' ? hpA : hpB}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-jungle-400 mb-5">
          체력은 목표 점수({gameState.settings.targetScore})에서 시작해 행동으로만 오르내립니다.
        </p>

        <p className="text-sm font-bold text-jungle-500 mb-2.5">동물별 경험치</p>
        <div className="flex flex-col gap-3">
          {ANIMALS.map(a => (
            <div key={a} className="flex items-center justify-between text-base">
              <span className="text-jungle-700 whitespace-nowrap">
                {ANIMAL_INFO[a].emoji} {ANIMAL_INFO[a].name}
              </span>
              <div className="flex gap-5 tabular-nums font-mono">
                <span
                  className={`font-bold w-14 text-right ${
                    gameState.teams.A.exp[a] >= gameState.teams.B.exp[a]
                      ? 'text-team-a'
                      : 'text-jungle-400'
                  }`}
                >
                  {gameState.teams.A.exp[a]}
                </span>
                <span className="text-jungle-400">vs</span>
                <span
                  className={`font-bold w-14 ${
                    gameState.teams.B.exp[a] >= gameState.teams.A.exp[a]
                      ? 'text-team-b'
                      : 'text-jungle-400'
                  }`}
                >
                  {gameState.teams.B.exp[a]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 행동 사용 통계 — 동물별로 몇 번, 총 몇 레벨어치를 발동했는지 */}
      <div
        className="bg-white rounded-2xl shadow-lg border border-jungle-200 p-7 w-full max-w-2xl"
        style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 300ms both' }}
      >
        <p className="text-center text-base font-bold text-jungle-500 mb-4">행동 사용 통계</p>
        <div className="grid grid-cols-2 gap-8">
          {(['A', 'B'] as const).map(t => (
            <div key={t}>
              <p
                className={`text-sm font-bold mb-2.5 truncate ${
                  t === 'A' ? 'text-team-a' : 'text-team-b'
                }`}
              >
                {t === 'A' ? '🟢' : '🔵'} {gameState.teamNames[t]}
              </p>
              <div className="flex flex-col gap-2">
                {ANIMALS.map(a => {
                  const stat = gameState.teams[t].skillStats[a];
                  return (
                    <div key={a} className="flex items-center justify-between gap-3 text-sm text-jungle-700">
                      <span className="whitespace-nowrap">{ANIMAL_INFO[a].emoji} {ANIMAL_INFO[a].name}</span>
                      <span className="tabular-nums font-mono whitespace-nowrap">
                        {stat.count}회 (합 Lv.{stat.totalLevel})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onBack}
        className="bg-jungle-600 hover:bg-jungle-700 text-white font-semibold py-3 px-10 rounded-xl transition-colors shadow"
        style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) 400ms both' }}
      >
        로비로 돌아가기
      </button>
      </div>

      <p className="text-sm text-jungle-400 text-center pt-4">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>
    </div>
  );
}
