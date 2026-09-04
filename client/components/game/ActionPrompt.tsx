'use client';

import type { Team } from 'shared';
import { TurnTimer } from './TurnTimer';
import { SPECTATOR_TEAM_PALETTE } from '@/lib/teamColors';

// 해설판 가운데에 얹히는 흰 배경(테두리 없음) 안내 오버레이 — 해설 텍스트와 겹치면
// 이 오버레이가 항상 위에 보인다. 카드를 뽑을 때도, 행동을 고를 때도 같은 자리·같은
// 컴포넌트(모래시계 타이머)를 재사용한다. 지금이 누구 차례인지에 따라 문구가 바뀐다:
//  - 상대 팀 차례 → "상대 턴이에요."
//  - 우리 팀 차례이지만 팀 내 다른 사람 차례 → "내 차례가 아니에요."
//  - 내가 카드를 뽑을 차례 → 모래시계 타이머(30초) + 안내 문구
//  - 내가 행동을 고를 차례 → 모래시계 타이머(고를 게 없으면 5초) + 안내 문구
// 첫 라운드(turn === 1)에는 이 문구 위에 "선 플레이어" 안내(방 설정/무작위 추첨 결과 어느
// 팀이 먼저 시작하는지)도 함께 보여준다.
export function ActionPrompt({
  myTeam,
  playerId,
  displayedActiveTeam,
  displayedActivePlayerIndex,
  memberIds,
  isMyDrawTurn,
  interactive,
  noEligible,
  turnDeadline,
  turnTotalMs,
  turn,
  startingTeam,
  startingTeamReason,
  teamNames,
}: {
  myTeam: Team | null;
  playerId: string | null;
  displayedActiveTeam: Team;
  displayedActivePlayerIndex: number;
  memberIds: Record<Team, string[]>;
  isMyDrawTurn: boolean; // 정산이 끝난 상태에서 내가 장소를 고를 차례인지
  interactive: boolean; // 정산이 끝난 상태에서 내가 행동을 고를 차례인지
  noEligible: boolean;
  turnDeadline: number; // 내 브라우저 시계 기준 만료 시각(useWebSocket이 환산해준 값)
  turnTotalMs: number;  // 게이지 100%에 해당하는 시간 — 서버가 상태와 함께 보내준다
  turn: number; // 1이면 아직 첫 라운드 — 선 플레이어 안내를 함께 보여준다
  startingTeam: Team;
  startingTeamReason: 'setting' | 'random';
  teamNames: Record<Team, string>;
}) {
  const spectating = myTeam === null;
  const isMyTeamTurn = myTeam !== null && displayedActiveTeam === myTeam;
  const isMyPlayerTurn =
    isMyTeamTurn && playerId !== null && memberIds[displayedActiveTeam]?.[displayedActivePlayerIndex] === playerId;

  let text: string | null = null;
  let showTimer = false;
  let urgent = false;

  if (spectating) {
    // 관전자에게는 "상대 턴"이라는 말이 성립하지 않는다 — 지금 누구 차례인지를 그대로
    // 알려주고, 조작은 못 해도 남은 시간은 함께 볼 수 있게 타이머를 띄운다.
    text = `관전 중 — ${teamNames[displayedActiveTeam]} 차례예요.`;
    showTimer = true;
  } else if (!isMyTeamTurn) {
    text = '상대 턴이에요.';
  } else if (!isMyPlayerTurn) {
    text = '내 차례가 아니에요.';
  } else if (interactive) {
    text = noEligible ? '아쉽게도 IP 에너지가 부족해요. 턴을 종료해주세요.' : '이번 턴의 행동을 선택하세요!';
    showTimer = true;
    urgent = noEligible;
  } else if (isMyDrawTurn) {
    text = '장소를 클릭해 카드를 뽑으세요!';
    showTimer = true;
  }

  if (text === null) return null;

  // 아직 첫 라운드(양 팀 모두 한 번씩도 안 둔 시점)면, 어느 팀이 왜 먼저 시작하는지를
  // 이 상시 노출 안내문 위에 함께 보여준다 — 화면 중앙에 잠깐(3.4초)만 떴다 사라지는
  // 별도 배너였던 이전 방식은 놓치기 쉽다는 피드백을 받아, 턴이 넘어갈 때까지 계속
  // 보이는 이 자리로 옮겼다.
  const firstTeamNote =
    turn === 1
      ? `${startingTeamReason === 'random' ? '무작위 추첨 결과' : '방 설정에 의해'} 먼저 시작하는 팀은 ${teamNames[startingTeam]}입니다.`
      : null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="bg-white rounded-xl px-5 py-2 flex flex-col items-center gap-1 shadow-sm">
        {firstTeamNote && (
          <p className="text-xs text-jungle-500 whitespace-nowrap">{firstTeamNote}</p>
        )}
        <div className="flex items-center gap-3">
          {showTimer && (
            <div className="w-56 shrink-0">
              {/* 게이지 폭(=100%)은 방 설정값을 클라이언트가 다시 계산하지 않고 서버가
                  알려주는 turnTotalMs를 그대로 쓴다 — 실용신양·도토리 축제 예약 뽑기로
                  늘어난 시간이나 행동할 게 없을 때의 짧은 시간까지 서버가 이미 반영해
                  보내주므로, 여기서 설정값만 보고 짐작하면 눈금과 숫자가 어긋난다. */}
              <TurnTimer deadline={turnDeadline} paused={false} totalMs={turnTotalMs} />
            </div>
          )}
          <p
            className={`font-bold whitespace-nowrap ${urgent ? 'text-amber-600' : 'text-jungle-700'}`}
            // 관전자에게는 이 문구도 지금 차례인 팀의 색으로 — 어느 팀 차례인지를
            // 화면 곳곳(패널·보드 테두리·손가락)과 같은 색으로 일관되게 알려준다.
            style={spectating ? { color: SPECTATOR_TEAM_PALETTE[displayedActiveTeam].deep } : undefined}
          >
            {text}
          </p>
        </div>
      </div>
    </div>
  );
}
