import type { ClientGameState, Team } from 'shared';
import { MAX_TURN, festivalDrawInfoAt } from 'shared';

function StepPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
        active ? 'step-pill-active' : 'step-pill-inactive'
      }`}
    >
      {label}
    </span>
  );
}

// 두 단계 사이 화살표 — 계속 색이 바뀌며 순서대로 밝아졌다 어두워지길 반복해
// "지금 흘러가는 중"이라는 느낌을 준다(활성화↔비활성화가 파도처럼 이어짐).
function FlowArrow() {
  return (
    <span className="flex items-center" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span key={i} className="step-chevron" style={{ animationDelay: `${i * 0.18}s` }}>
          &gt;
        </span>
      ))}
    </span>
  );
}

export function GameHeader({
  gameState,
  myTeam,
  displayedActiveTeam,
  displayedActivePlayerIndex,
  isSettling,
}: {
  gameState: ClientGameState;
  myTeam: Team | null;
  displayedActiveTeam: Team;
  displayedActivePlayerIndex: number;
  isSettling: boolean;
}) {
  const teamLabel = `${displayedActiveTeam === 'A' ? '🟢' : '🔵'} ${gameState.teamNames[displayedActiveTeam]}`;
  const nickname = gameState.teams[displayedActiveTeam].members[displayedActivePlayerIndex] ?? '';

  // "지금 이 차례가 나(우리팀)인지 상대인지" + "장소 선택 → 행동 선택" 중 어느 단계인지를
  // 도식으로 보여준다. 실제 타이머는 해설판 가운데 오버레이(ActionPrompt)가 담당하므로
  // 여기서는 중복 표시하지 않는다.
  const relativeLabel = myTeam === null ? gameState.teamNames[displayedActiveTeam] : displayedActiveTeam === myTeam ? '우리팀' : '상대팀';
  // 서버가 이미 pendingChoice를 세워도(=장소 뽑기 자체는 끝났어도), 카드가 날아가고
  // 경험치·레벨이 반영되는 정산 연출이 다 끝나기 전까지는 아직 "행동 선택" 단계가
  // 아니다 — 그 앞 단계(장소 선택)가 마무리되는 그림을 계속 보여준다.
  const isDrawPhase = gameState.pendingChoice === null;
  const isChoicePhase = !isDrawPhase && !isSettling;
  // 이번 턴의 도토리 축제 보너스 안내 — 팀의 pendingFestivalDraws를 그대로 읽으면 장소를
  // 클릭하는 순간 소모돼 0이 되므로(=행동 선택 단계에서 문구가 짧아진다), 예약과 똑같은 식
  // (festivalDrawInfoAt)으로 "이번 턴에 걸린 횟수"를 다시 계산해 두 단계에서 같은 문구를 쓴다.
  const festivalInfo = festivalDrawInfoAt(gameState.turn, gameState.settings);

  return (
    <header className="relative bg-jungle-800 text-white px-5 py-2.5 flex items-center shadow-md shrink-0 min-h-[3.25rem]">
      <div className="text-sm text-jungle-200 hidden sm:block">
        {teamLabel} <span className="font-semibold text-white">{nickname}</span> 차례
      </div>

      {/* 나뭇잎 장식이 화면 좌우 모서리를 가리므로, 턴/단계 표시는 항상 잘 보이도록 중앙에 고정 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
        <span className="text-sm font-bold tabular-nums whitespace-nowrap">
          {gameState.turn} / {MAX_TURN}턴
        </span>
        <div className="step-flow flex items-center gap-1.5 px-2 py-1 rounded-full">
          <span className="text-xs font-bold text-jungle-200 whitespace-nowrap">[{relativeLabel}]</span>
          <StepPill label="장소 선택" active={isDrawPhase} />
          <FlowArrow />
          <StepPill label="행동 선택" active={isChoicePhase} />
        </div>
        {gameState.festival && (
          <span className="festival-header-badge text-sm font-bold whitespace-nowrap">
            🌰 도토리 축제 진행 중! 보너스 랜덤 뽑기 +{festivalInfo.count}회!
            {/* 강화 주기가 남은 턴보다 커서 다시 오를 일이 없으면 예고 자체를 감춘다. */}
            {festivalInfo.turnsToNextStage !== null &&
              ` (${festivalInfo.turnsToNextStage}턴 후 +${festivalInfo.nextCount}회)`}
          </span>
        )}
      </div>
    </header>
  );
}
