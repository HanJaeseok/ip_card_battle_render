'use client';

import { useEffect, useState } from 'react';
import type { ClientGameState, Team } from 'shared';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { spectatorTeamVars } from '@/lib/teamColors';

// 팀 체력(=점수) — 아래가 0, 위가 WIN_HP인 유리구슬. 중간(시작값)부터 차오르거나
// 줄어든다. 상표토끼로 오르면 연두색 기운이 샤라락 훑고, 특허랑이에게 뺏기면
// 붉은 기운이 빠직! 하고 금 가며 구슬이 흔들리고 파편이 튄다.
export function TeamTotalPanel({
  team,
  gameState,
  myTeam,
  pulse,
}: {
  team: Team;
  gameState: ClientGameState;
  // 보는 사람의 팀 — null이면 관전 시점이라 "내 구슬/상대 구슬"이 아니라 두 구슬을
  // 각 팀 색(client/lib/teamColors.ts의 팔레트)으로 칠한다.
  myTeam: Team | null;
  pulse?: { id: number; direction: 'gain' | 'loss' } | null;
}) {
  const hp = gameState.teams[team].hp;
  const winHp = gameState.settings.targetScore * 2;
  const spectating = myTeam === null;
  const toneClass = spectating ? 'hp-orb-spectator' : myTeam === team ? 'hp-orb-mine' : 'hp-orb-enemy';
  const fillPct = Math.max(0, Math.min(100, (hp / winHp) * 100));

  const [activePulse, setActivePulse] = useState<{ id: number; direction: 'gain' | 'loss' } | null>(null);
  const [shards, setShards] = useState<{ dx: number; dy: number }[]>([]);

  useEffect(() => {
    if (!pulse) {
      // 부모(useAnimationQueue)가 이 팀의 pulse를 먼저 정리해버리면(다음 액션이 예상보다
      // 빨리 도착하는 등) 여기서도 즉시 걷어내야 한다 — 그렇지 않으면 아래 700ms 타이머가
      // 이미 취소된 채로 activePulse가 영원히 남아 붉은 금(hp-orb-crack)이 계속 보인다.
      setActivePulse(null);
      setShards([]);
      return;
    }
    setActivePulse(pulse);
    if (pulse.direction === 'loss') {
      setShards(
        Array.from({ length: 6 }, () => {
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 30;
          return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
        }),
      );
    }
    const t = setTimeout(() => {
      setActivePulse(prev => (prev?.id === pulse.id ? null : prev));
      setShards([]);
    }, 700);
    return () => clearTimeout(t);
  }, [pulse]);

  // 체력 1점 = 눈금 한 칸 — 목표 체력(winHp = targetScore × 2)만큼 칸을 나눠, 지금
  // 몇 칸째인지 한눈에 보이도록 반투명한 눈금선을 긋는다(예: 목표 5점 → 10칸).
  const segmentLines = Array.from({ length: winHp - 1 }, (_, i) => ((i + 1) / winHp) * 100);

  return (
    <div
      className={`hp-orb w-full shrink-0 h-full ${toneClass}`}
      style={spectating ? spectatorTeamVars(team) : undefined}
    >
      <LeafDecoration position="tl" size={30} swaying={activePulse !== null} />
      <LeafDecoration position="br" size={30} swaying={activePulse !== null} />
      <div className="hp-orb-liquid" style={{ height: `${fillPct}%` }}>
        <div className="hp-orb-wave" />
      </div>
      <div className="hp-orb-segments" aria-hidden>
        {segmentLines.map(pct => (
          <span key={pct} className="hp-orb-segment-line" style={{ bottom: `${pct}%` }} />
        ))}
      </div>
      <div className="hp-orb-sheen" />
      {activePulse?.direction === 'gain' && <div className="hp-orb-surge" />}
      {activePulse?.direction === 'loss' && (
        <>
          <div className="hp-orb-crack" />
          {shards.map((s, i) => (
            <span key={i} className="hp-orb-shard" style={{ '--shard-dx': `${s.dx}px`, '--shard-dy': `${s.dy}px` } as React.CSSProperties} />
          ))}
        </>
      )}
      <p className="hp-orb-value tabular-nums">{hp}</p>
    </div>
  );
}
