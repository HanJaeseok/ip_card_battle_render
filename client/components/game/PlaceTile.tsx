'use client';

import { useState } from 'react';
import type { Place, Team } from 'shared';
import { GuideFinger } from './GuideFinger';

const PRESS_DUR = 180;

export function PlaceTile({
  place,
  disabled,
  forbidden = false,
  onClick,
  showGuide,
  guideTeam = null,
}: {
  place: Place;
  disabled: boolean;
  // 직전 턴에 이미 이 장소에서 뽑아서, 이번 턴엔 규칙상 고를 수 없다(50% 검은 배경 +
  // 흰색 금지 마크). disabled(내 차례가 아님)와는 별개 이유라 시각 표현도 다르게 둔다 —
  // disabled는 4칸 전부 흐리게, forbidden은 이 한 칸만 검게 덮고 금지 마크를 얹는다.
  forbidden?: boolean;
  onClick: (place: Place) => void;
  showGuide?: boolean; // 내가 장소를 고를 수 있는 턴마다 "여길 눌러보세요" 손가락 가이드를 보여준다(설정에서 끌 수 있음)
  // 관전 시점일 때만 채워진다 — 지금 장소를 고르는 팀. 손가락이 그 팀 색의 반투명
  // 손가락으로 바뀌어, 누를 수 있다는 권유가 아니라 진행 상황 중계임을 드러낸다.
  guideTeam?: Team | null;
}) {
  const [pressed, setPressed] = useState(false);
  const blocked = disabled || forbidden;

  const handleClick = () => {
    if (blocked) return;
    setPressed(true);
    setTimeout(() => setPressed(false), PRESS_DUR);
    onClick(place);
  };

  return (
    // 가이드 손가락은 버튼 위쪽 경계 밖으로 살짝 튀어나가도록 배치되는데, 버튼 자체가
    // (모서리를 둥글게 다듬으려고) overflow-hidden이라 그 안에 두면 튀어나온 부분이
    // 잘려 보인다. 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다.
    <div className="relative w-full h-full">
      <button
        data-place-key={place}
        onClick={handleClick}
        disabled={blocked}
        className={`relative w-full h-full rounded-2xl overflow-hidden select-none ${
          blocked ? 'pointer-events-none' : 'cursor-pointer'
        } ${pressed ? 'place-tile-pressed' : ''}`}
      >
        {/* 배경을 어둡게/밝게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 버튼 전체에
            걸면 그 위의 장소 라벨까지 함께 어두워져 거의 안 보인다(스킬 선택 패널에서
            겪었던 것과 같은 문제). forbidden은 disabled 취급하지 않는다 — 아래 검은
            오버레이 하나로 충분해서, 배경 이미지 자체를 또 흐리게 하면 이중으로 탁해진다. */}
        <div
          className={`place-tile absolute inset-0 ${disabled ? 'place-tile-disabled' : 'place-tile-active'}`}
          style={{ backgroundImage: `url(/places/${place}.png)` }}
        />

        {/* 장소 설명 라벨 — object-contain으로 타일 너비/높이에 맞춰 함께 축소·확대된다 */}
        <img
          src={`/places/${place}_text.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />

        {forbidden && (
          <div className="place-forbidden-overlay absolute inset-0 flex items-center justify-center" aria-hidden>
            <svg viewBox="0 0 100 100" className="place-forbidden-mark">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#ffffff" strokeWidth="11" />
              <line x1="21" y1="21" x2="79" y2="79" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </button>

      {showGuide && <GuideFinger team={guideTeam} />}
    </div>
  );
}
