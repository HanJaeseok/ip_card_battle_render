'use client';

import type { Animal, ClientGameState, Place, StackedCard, Team } from 'shared';
import { PLACES } from 'shared';
import { PlaceTile } from './PlaceTile';
import { AnimalStackArea } from './AnimalStackArea';
import { CardCaptionLayer } from '@/components/effects/CardCaptionLayer';
import { CardFocusLayer } from '@/components/effects/CardFocusLayer';
import { DrawSlotLayer } from '@/components/effects/DrawSlotLayer';
import { WoolBallLayer } from '@/components/effects/WoolBallLayer';
import { AcornBallLayer } from '@/components/effects/AcornBallLayer';
import { FestivalStartBurstLayer } from '@/components/effects/FestivalStartBurstLayer';
import { MermaidPopup } from './MermaidPopup';
import { useGuideEnabled } from '@/lib/guideSettings';
import type {
  AcornBallItem,
  CaptionItem,
  DrawSlotItem,
  PlaceFocusItem,
  ShakingPile,
  WoolBallItem,
} from '@/hooks/useAnimationQueue';

const GRID_AREA: Record<Place, string> = {
  house: 'house',
  forest_road: 'forest',
  dock: 'dock',
  river_road: 'river',
};

export function GameBoard({
  gameState,
  myTeam,
  canAct,
  onPlaceClick,
  captions,
  placeFocusBursts,
  drawSlots,
  woolBalls,
  acornBalls,
  collectingCardIds,
  shakingPile,
  newCardId,
  stackCards,
  displayedActiveTeam,
  festivalFlash,
  festivalBurst,
  mermaidPopup,
}: {
  gameState: ClientGameState;
  myTeam: Team | null;
  // 지금 이 자리에서 정확히 나 자신이 장소를 고를 수 있는지(GameLayout.isMyDrawTurn을
  // 그대로 받는다) — 팀만 맞는 게 아니라 N:N일 때 그 팀 안에서도 지금 차례인 그
  // 플레이어 본인이어야 한다. 정산 연출이 완전히 끝났는지도 이미 반영돼 있다: 서버는
  // 행동 선택/효과 반영이 끝나는 즉시 activeTeam을 넘기지만, 그 순간 곧바로 조작
  // 가능해지면 아직 상대의 정산·효과 애니메이션이 재생 중인데도 내 턴처럼 장소가
  // 호버·클릭되어 버려 플레이 감성을 해친다.
  canAct: boolean;
  onPlaceClick: (place: Place) => void;
  captions: CaptionItem[];
  placeFocusBursts: PlaceFocusItem[];
  drawSlots: DrawSlotItem[];
  woolBalls: WoolBallItem[];
  acornBalls: AcornBallItem[];
  collectingCardIds: ReadonlySet<number>;
  shakingPile: ShakingPile | null;
  newCardId: number | null;
  stackCards: Record<Animal, StackedCard[]>;
  displayedActiveTeam: Team;
  festivalFlash: boolean;
  festivalBurst: boolean;
  mermaidPopup: { team: Team } | null;
}) {
  // 예전엔 게임당 첫 턴에만 손가락 가이드를 잠깐 보여줬는데, 그 순간을 놓친 사람은
  // 규칙을 다시 확인할 방법이 없었다("규칙을 모르겠다" 피드백의 원인). 이제는 내가
  // 실제로 장소를 고를 수 있는 턴마다 매번 띄우고, 설정 패널(⚙️)에서 끄고 켤 수 있게
  // 했다(useGuideEnabled). 장소를 하나 고른 뒤(행동 선택 단계로 넘어간 뒤)에는 꺼지고,
  // 대신 SkillChoiceBar의 행동 버튼/[턴 마치기]에 가이드가 옮겨간다.
  const guideEnabled = useGuideEnabled();
  const showPlaceGuide = guideEnabled && canAct && gameState.pendingChoice === null;
  // 테두리 펄스·동물 무드(happy/focus)는 정산 연출이 끝날 때까지 "내 차례"로 유지되는
  // 화면상 턴을 따른다.
  const isMyTurnDisplayed = myTeam !== null && displayedActiveTeam === myTeam;

  return (
    <div
      data-board-root
      className={`flex-1 relative bg-jungle-50/50 rounded-2xl border-2 p-2 grid gap-2 ${
        isMyTurnDisplayed ? 'board-my-turn' : 'border-jungle-200'
      }`}
      style={{
        gridTemplateAreas: '"house center center dock" "forest center center river"',
        gridTemplateColumns: '1fr 1.15fr 1.15fr 1fr',
        gridTemplateRows: '1fr 1fr',
      }}
    >
      {PLACES.map(place => {
        // 직전에(어느 팀이든) 실제로 클릭했던 장소는 다음 차례엔 못 고른다. 이 표시는
        // canAct(내가 지금 장소를 고를 수 있는지)와 무관하게 항상 보여준다 — "지금 이
        // 장소가 금지 상태"라는 사실 자체는 누구 턴이든, 어느 단계(장소 선택/행동 선택)
        // 든 항상 같아야 하는 정보이기 때문이다. 예전엔 canAct에 묶여 있어서 상대
        // 턴에는 안 보이고, 내 턴 안에서도 행동 선택 단계로 넘어가면 사라졌다.
        const isForbidden = place === gameState.lastPlace;
        return (
          <div key={place} style={{ gridArea: GRID_AREA[place] }}>
            <PlaceTile
              place={place}
              disabled={!canAct}
              forbidden={isForbidden}
              onClick={onPlaceClick}
              showGuide={showPlaceGuide && !isForbidden}
            />
          </div>
        );
      })}

      <div style={{ gridArea: 'center' }}>
        <AnimalStackArea
          stackCards={stackCards}
          collectingIds={collectingCardIds}
          shakingPile={shakingPile}
          newCardId={newCardId}
          isMyTurn={isMyTurnDisplayed}
        />
      </div>

      {festivalFlash && <div className="expand-flash" />}
      {mermaidPopup && <MermaidPopup team={mermaidPopup.team} />}

      <CardCaptionLayer captions={captions} myTeam={myTeam} />
      <CardFocusLayer items={placeFocusBursts} />
      <DrawSlotLayer items={drawSlots} />
      <WoolBallLayer items={woolBalls} />
      <AcornBallLayer items={acornBalls} />
      <FestivalStartBurstLayer active={festivalBurst} />
    </div>
  );
}
