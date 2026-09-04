import type { ClientGameState, Team } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { withDisplayedExp } from '@/lib/skills';
import { PlayerList } from './PlayerList';
import { ScorePanel } from './ScorePanel';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { SPECTATOR_TEAM_PALETTE, spectatorTeamVars } from '@/lib/teamColors';

export function TeamPanel({
  team,
  myTeam,
  gameState,
  animState,
}: {
  team: Team;
  myTeam: Team | null;
  gameState: ClientGameState;
  animState: AnimationState;
}) {
  const teamState = gameState.teams[team];
  // 정산 연출이 끝날 때까지는 "화면상" 활성 팀(displayedActiveTeam)을 기준으로 삼는다 —
  // 실제 gameState.activeTeam은 액션 처리 즉시 다음 팀으로 넘어가 있기 때문.
  const isActiveTeam = animState.displayedActiveTeam === team;

  // 관전 시점(myTeam === null)에는 "우리 팀 / 상대 팀"이라는 기준 자체가 없다. 그래서
  // 두 팀을 각자의 중립색(기본: 팀 1 민트, 팀 2 핑크 — client/lib/teamColors.ts)으로
  // 칠해, 배경색만 보고도 어느 쪽이 어느 팀인지 구분할 수 있게 한다.
  const spectating = myTeam === null;
  const teamColor = spectating ? '' : team === 'A' ? 'text-team-a' : 'text-team-b';
  const teamRing = !isActiveTeam
    ? ''
    : spectating
      ? 'spectator-team-panel-active'
      : team === 'A'
        ? 'ring-[3px] ring-team-a shadow-lg'
        : 'ring-[3px] ring-team-b shadow-lg';

  // 배경색은 "지금 누구 차례인지"가 아니라 "이 영역이 어느 팀인지"로 고정한다
  // (우리팀 = 연두, 상대팀 = 연붉은) — 차례 표시는 위 teamRing(테두리)만 담당한다.
  const isMine = myTeam === team;
  const bgClass = spectating ? 'spectator-team-panel' : isMine ? 'bg-lime-100' : 'bg-rose-100';

  const teamEmoji = team === 'A' ? '🟢' : '🔵';
  const label = `${teamEmoji} ${gameState.teamNames[team]}`;

  // 타이거 스킬 연출 — 발동한 쪽은 반동(recoil), 맞는 쪽은 충격(hit shake)
  const recoilClass = animState.tigerRecoil?.attackerTeam === team ? (team === 'A' ? 'panel-recoil-a' : 'panel-recoil-b') : '';
  const hitShakeClass = animState.tigerSlash?.onTeam === team ? 'panel-hit-shake' : '';
  // 상표토끼 스킬 연출 — 날아온 토끼가 부딪히는 압박 효과
  const rabbitPressureClass = animState.rabbitPressure?.targetTeam === team ? 'panel-rabbit-pressure' : '';
  // 이 팀이 방금 행동을 발동했으면(해설 자막이 뜨는 그 순간) 모서리 잎사귀가 살랑살랑
  // 흔들려 "지금 이 팀에 효과가 생겼다"는 걸 은은하게 강조한다.
  const justActed = animState.captions.some(c => c.tier === 'effect' && c.team === team);

  return (
    <div
      data-rabbit-target={team}
      className={`relative w-full h-full min-h-0 shrink-0 ${bgClass} rounded-2xl border border-jungle-200 ${teamRing} ${recoilClass} ${hitShakeClass} ${rabbitPressureClass} transition-colors transition-shadow`}
      style={spectating ? spectatorTeamVars(team) : undefined}
    >
      <LeafDecoration position="tr" size={40} swaying={justActed} />
      <LeafDecoration position="bl" size={32} swaying={justActed} />

      <div className="relative z-[1] h-full min-h-0 p-4 flex flex-col gap-3 overflow-y-auto">
        <div
          className={`text-base font-bold ${teamColor} flex items-center gap-1.5 flex-wrap`}
          style={spectating ? { color: SPECTATOR_TEAM_PALETTE[team].deep } : undefined}
        >
          {label}
          {/* 그냥 색 있는 글자로 "우리팀♥"라고 붙여두던 걸, 다른 곳(GameHeader의
              StepPill 등)과 같은 알약 배지 모양으로 바꿨다 — 배경 없이 튀는 색 글자만
              둥둥 떠 있던 것보다 하나의 "표식"처럼 보이게 하기 위함. */}
          {isMine && (
            <span className="inline-flex items-center gap-1 bg-white/80 text-amber-600 text-2xs font-bold px-2 py-0.5 rounded-full shadow-sm border border-amber-200">
              <span aria-hidden>⭐</span> 내 팀
            </span>
          )}
        </div>

        <PlayerList
          team={team}
          members={teamState.members}
          activePlayerIndex={animState.displayedActivePlayerIndex}
          isActiveTeam={isActiveTeam}
        />

        <hr className="border-jungle-100" />

        <ScorePanel
          team={team}
          gameState={withDisplayedExp(gameState, team, animState.displayedExp[team])}
          scoreFlash={animState.scoreFlash}
          displayedExp={animState.displayedExp[team]}
        />
      </div>
    </div>
  );
}
