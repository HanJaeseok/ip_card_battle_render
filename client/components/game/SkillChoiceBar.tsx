'use client';

import type { Animal, ClientGameState, Team } from 'shared';
import { previewSkill } from '@/lib/skills';
import { SKILL_TITLE, SKILL_COLOR, describeSkill } from '@/lib/skillInfo';
import { useGuideEnabled } from '@/lib/guideSettings';
import { spectatorTeamVars } from '@/lib/teamColors';
import { GuideFinger } from './GuideFinger';

const ANIMAL_ORDER: Animal[] = ['sheep', 'rabbit', 'mermaid', 'tiger'];

// 턴을 마친 뒤 행동을 고르는 영역 — 화면을 덮는 모달이 아니라 항상 보드 아래
// (양 팀 합계 사이)에 자리한다. 로직은 기존과 동일하게 "내 팀의 행동 선택
// 차례"일 때만 클릭이 가능하고, 그 외에는 마우스를 올려 설명만 미리 볼 수 있다.
// 지금 누를 수 있는 패널(레벨이 있어 고를 수 있는 행동, 그리고 항상 고를 수
// 있는 "아무것도 하지 않음")은 은은하게 빛나 무엇을 눌러야 할지 강조해준다.
export function SkillChoiceBar({
  gameState,
  team,
  interactive,
  spectatorGuideTeam = null,
  myTeamChoosing = false,
  onChoose,
  onPass,
}: {
  gameState: ClientGameState;
  team: Team;
  interactive: boolean; // 지금이 실제로 이 팀(=나)이 행동을 고를 차례인지
  // 관전 시점일 때만 채워진다 — 지금 행동을 고르고 있는 팀. 관전자는 누를 수 없으므로
  // 그 팀 색 손가락으로 "이 중에서 고르는 중"이라는 진행만 중계한다.
  spectatorGuideTeam?: Team | null;
  // 우리 팀이 행동을 고르는 단계인지(팀 안의 다른 사람 차례여도 참) — 이 띠 전체가
  // 은은하게 빛나 "이번엔 여기를 봐야 한다"고 알린다. 장소 선택 단계에는 대신 카드판이
  // 빛나고 이 값은 false다(GameLayout이 두 곳을 번갈아 켠다).
  myTeamChoosing?: boolean;
  onChoose: (animal: Animal) => void;
  onPass: () => void;
}) {
  const previews = ANIMAL_ORDER.map(animal => previewSkill(gameState, team, animal));

  // 예전엔 이 팀의 첫 행동이 해금된 그 순간에만(평생 1회) 손가락 가이드를 보여줬는데,
  // 그 순간을 놓치면 다시 볼 방법이 없었다. 이제는 행동을 고를 수 있는 턴마다 매번
  // 보여주고, 설정 패널(⚙️)에서 원하는 사람만 끌 수 있게 했다.
  const guideEnabled = useGuideEnabled();
  const showSkillGuide = guideEnabled && (interactive || spectatorGuideTeam !== null);

  // 행동 선택 단계에만 이 띠가 빛난다. 관전자는 지금 고르는 팀의 색으로(그 팀 색 변수를
  // 함께 심어준다), 플레이어는 우리 팀 차례일 때 연두색으로.
  const glowClass = spectatorGuideTeam
    ? 'skill-bar-spectator-turn'
    : myTeamChoosing
      ? 'skill-bar-my-turn'
      : '';

  return (
    // 마우스를 올리면 그 칸이 살짝 떠오르며 커지는 연출을 넣으려면 각 버튼이 이 컨테이너
    // 밖으로 튀어나갈 수 있어야 한다 — 그래서 여기서는 overflow-hidden을 쓰지 않는다
    // (전체 띠의 둥근 모서리는 대신 양 끝 버튼 각각에 rounded-l/r-2xl + overflow-hidden으로 준다).
    <div
      className={`h-full min-h-0 bg-jungle-950 rounded-2xl grid grid-cols-5 divide-x-2 divide-jungle-700 ${glowClass}`}
      style={spectatorGuideTeam ? spectatorTeamVars(spectatorGuideTeam) : undefined}
    >
      {ANIMAL_ORDER.map((animal, i) => {
        const preview = previews[i];
        const eligible = preview.level > 0;
        const clickable = interactive && eligible;
        const desc = describeSkill(animal, preview.level);
        // 특허랑이처럼 효과가 둘 이상인 행동은 문구가 그냥 이어 붙어 "체력 +4상대 체력 -4"처럼
        // 읽히므로, 각 효과를 조각으로 모아 쉼표로 이어 붙인다.
        const effectParts: string[] = [];
        if (preview.extraDraws > 0) effectParts.push(`다음 턴 카드 +${preview.extraDraws}회`);
        if (preview.myHpDelta > 0) effectParts.push(`내 체력 +${preview.myHpDelta}`);
        if (preview.oppHpDelta < 0) effectParts.push(`상대 체력 ${preview.oppHpDelta}`);
        if (animal === 'mermaid') effectParts.push(`다음 행동 ×${preview.multiplierAfter}`);

        // 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
        // 다듬으려고, 특히 맨 왼쪽 sheep은) overflow-hidden이라 그 안에 두면 잘려 보인다
        // — 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다(패스 버튼과 동일한 처리).
        return (
          <div key={animal} className="relative h-full">
            <button
              onClick={() => clickable && onChoose(animal)}
              disabled={!clickable}
              className={`skill-choice-panel group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
                i === 0 ? 'rounded-l-2xl overflow-hidden' : ''
              } ${clickable ? 'skill-choice-glow' : ''}`}
            >
              {/* 컷신 이미지 어둡게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 예전처럼
                  버튼 전체에 filter를 걸면 그 위에 z-index로 얹은 자막(제목·설명·레벨
                  표시)까지 함께 어두워져 "레벨 부족"일 때 글자가 거의 안 보였다. */}
              <div
                className={`skill-choice-bg absolute inset-0 ${eligible ? '' : 'skill-choice-bg-disabled'}`}
                style={{ backgroundImage: `url(/skills/${animal}_skill.png)` }}
              />
              <div className="skill-choice-dim absolute inset-0" />
              {/* 레벨이 있을 때는(활성) 이 자리에 "레벨 N 소모" 대신 실제 효과(카드 추가
                  뽑기·체력 강탈 등, 노란색)를 보여준다 — 레벨이 없으면(비활성) 흰색
                  "레벨 부족"으로 돌아간다. 예전엔 효과 문구를 좌상단에 따로 뒀는데, 우상단
                  한 곳으로 합쳐 중복 표시를 없앴다. */}
              <span
                className={`skill-outline-text absolute top-2 right-3 z-10 text-lg font-bold ${
                  eligible ? 'text-amber-300' : 'text-white'
                }`}
              >
                {eligible ? effectParts.join(', ') : '레벨 부족'}
              </span>
              <div className="relative z-10 flex flex-col gap-2 p-3 min-h-[9rem]">
                <h3
                  className="skill-outline-text text-xl font-extrabold"
                  style={{ color: SKILL_COLOR[animal] }}
                >
                  [{SKILL_TITLE[animal]}]
                </h3>
                <p className="skill-outline-text text-base text-white leading-snug whitespace-pre-line">
                  {desc.effect}
                </p>
                <p
                  className="skill-outline-text text-sm font-bold leading-snug"
                  style={{ color: SKILL_COLOR[animal] }}
                >
                  &quot;{desc.catchphrase}&quot;
                </p>
              </div>
            </button>

            {/* 지금 고를 수 있는(레벨이 있는) 행동마다, 내가 행동을 고를 수 있는 턴이면 매번 뜬다. */}
            {showSkillGuide && eligible && <GuideFinger team={spectatorGuideTeam} />}
          </div>
        );
      })}

      {/* 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
          다듬으려고) overflow-hidden이라 그 안에 두면 잘려 보인다 — 그래서 가이드는
          이 바깥의, 잘리지 않는 래퍼에 그린다(장소 타일에서 겪었던 것과 같은 문제). */}
      <div className="relative">
        <button
          onClick={() => interactive && onPass()}
          disabled={!interactive}
          className={`skill-choice-panel group relative flex flex-col items-stretch justify-end text-left rounded-r-2xl overflow-hidden w-full h-full ${
            interactive ? 'skill-choice-glow' : ''
          }`}
        >
          <div className="skill-choice-bg pass-panel-bg absolute inset-0" />
          <div className="skill-choice-dim absolute inset-0" />
          <div className="relative z-10 flex flex-col gap-1.5 p-3 min-h-[9rem]">
            <h3 className="skill-outline-text text-xl font-extrabold text-jungle-200">[턴 마치기]</h3>
            <p className="skill-outline-text text-base text-white leading-snug whitespace-pre-line">
              {'지금은 할 수 있는게 없네요.\n레벨을 높이고,\n한 번에 몰아치는 방법도 좋답니다.'}
            </p>
          </div>
        </button>

        {/* 언제나 누를 수 있는 이 버튼도, 행동 선택 차례마다 손가락으로 짚어준다. */}
        {showSkillGuide && <GuideFinger team={spectatorGuideTeam} />}
      </div>
    </div>
  );
}
