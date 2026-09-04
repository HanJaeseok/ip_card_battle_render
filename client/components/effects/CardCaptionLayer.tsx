'use client';

import { useLayoutEffect, useState } from 'react';
import type { Team } from 'shared';
import type { CaptionItem } from '@/hooks/useAnimationQueue';
import { spectatorTeamVars } from '@/lib/teamColors';

// 카드판 위에 "페어 성사(카드 폭발 포함) / 효과 발동"을 큰 자막으로 강조한다.
// pair는 그 동물 스택 위에, effect는 보드 중앙에 고정 표시한다.
// effect 자막은 우리 팀이 발동시켰으면 초록, 상대 팀이면 빨강, 중립이면 금색으로 구분한다.
export function CardCaptionLayer({
  captions,
  myTeam,
}: {
  captions: CaptionItem[];
  myTeam: Team | null;
}) {
  const effectCaptions = captions.filter(c => c.tier === 'effect');
  const anchoredCaptions = captions.filter(c => c.tier !== 'effect');

  return (
    <>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none z-40">
        {effectCaptions.map(c => {
          // 관전자(myTeam === null)에게는 아군/적군이 없으므로, 발동한 팀의 색
          // (기본: 민트·핑크 — client/lib/teamColors.ts)으로 쓴다. 예전엔 이 경우가
          // 그냥 "적군"으로 떨어져 양 팀 자막이 모두 빨갛게 나왔다.
          const spectating = myTeam === null;
          const sideClass =
            c.team === undefined
              ? 'card-caption-effect-neutral'
              : spectating
                ? 'card-caption-effect-spectator'
                : c.team === myTeam
                  ? 'card-caption-effect-ally'
                  : 'card-caption-effect-enemy';
          return (
            <span
              key={c.id}
              className={`card-caption card-caption-effect ${sideClass}`}
              style={spectating && c.team !== undefined ? spectatorTeamVars(c.team) : undefined}
            >
              {c.text}
            </span>
          );
        })}
      </div>
      {anchoredCaptions.map(c => (
        <AnchoredCaption key={c.id} caption={c} />
      ))}
    </>
  );
}

// tier별 오프셋(px) — 카드 한 장 바로 위(anchorCardId)는 살짝만, 스택 영역 전체
// 기준(대체 앵커)일 때는 더 크게 띄운다.
const TIER_OFFSET: Record<string, number> = { pair: 62 };
const CARD_ANCHOR_OFFSET = 30;

function AnchoredCaption({ caption }: { caption: CaptionItem }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    // pair는 짝을 이룬 카드 중 가장 마지막(가장 오른쪽) 카드 바로 위에 앵커링한다 —
    // 그 카드를 못 찾으면(연출 타이밍 어긋남 등) 동물 스택 영역 전체를 대체 앵커로 쓴다.
    const cardEl = caption.anchorCardId != null
      ? document.querySelector(`[data-stack-card-id="${caption.anchorCardId}"]`)
      : null;
    if (cardEl) {
      const r = cardEl.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top - CARD_ANCHOR_OFFSET + TIER_OFFSET[caption.tier] });
      return;
    }

    const selector = caption.placeKey
      ? `[data-place-key="${caption.placeKey}"]`
      : caption.stackAnimal
        ? `[data-stack-area="${caption.stackAnimal}"]`
        : null;
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caption.id]);

  if (!pos) return null;

  return (
    <span
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y - TIER_OFFSET[caption.tier],
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 41,
      }}
    >
      <span className={`card-caption card-caption-${caption.tier}`}>{caption.text}</span>
    </span>
  );
}
