'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Team } from 'shared';
import { SPECTATOR_TEAM_PALETTE } from '@/lib/teamColors';

type Tier = 'mine' | 'ally' | 'enemy' | 'spectator';

interface Announcement {
  id: number;
  text: string;
  tier: Tier;
  // 관전자용 알약은 팀 색이 두 가지뿐이라 CSS 클래스 대신 팔레트 값을 그대로 인라인으로
  // 입힌다(색을 바꾸려면 client/lib/teamColors.ts만 고치면 되는 원칙은 그대로).
  style?: CSSProperties;
}

const DUR_MS = 1400;
let idCounter = 0;

/**
 * 관전자용 알약 색 — 그 팀 색으로 테두리·글자·그림자를 한 번에 맞춘다.
 * 화면 배치가 "팀 1 = 왼쪽, 팀 2 = 오른쪽"으로 고정이라(GameLayout의 3열 그리드) 문구도
 * 그 위치를 그대로 부른다.
 */
function spectatorPillStyle(team: Team): CSSProperties {
  const p = SPECTATOR_TEAM_PALETTE[team];
  return {
    fontSize: '2.6rem',
    color: p.deep,
    border: `4px solid ${p.strong}`,
    outline: `4px solid ${p.softEdge}`,
    outlineOffset: 4,
    boxShadow: `0 14px 34px ${p.glow}`,
  };
}

function computeAnnouncement(
  myTeam: Team | null,
  playerId: string | null,
  memberIds: Record<Team, string[]>,
  activeTeam: Team,
  activePlayerIndex: number,
): { text: string; tier: Tier; style?: CSSProperties } | null {
  // 관전자(myTeam === null)에게는 "내/우리팀"이 없다 — 대신 어느 쪽 팀 차례인지를
  // 화면에서 그 팀이 실제로 앉아 있는 위치(왼쪽/오른쪽)로 알려, 매 턴 좌우로 오가는
  // 것만 봐도 진행이 읽히게 한다.
  if (myTeam === null) {
    return {
      text: activeTeam === 'A' ? '👈 왼쪽 팀 차례' : '오른쪽 팀 차례 👉',
      tier: 'spectator',
      style: spectatorPillStyle(activeTeam),
    };
  }
  if (activeTeam !== myTeam) return { text: '상대 차례', tier: 'enemy' };
  const activePlayerId = memberIds[activeTeam]?.[activePlayerIndex];
  if (playerId !== null && activePlayerId === playerId) return { text: '내 차례', tier: 'mine' };
  return { text: '우리팀 차례', tier: 'ally' };
}

// 각 팀(정확히는 각 플레이어)의 턴이 시작되는 순간 "내 차례"/"우리팀 차례"/"상대 차례"를
// 화면 중앙에 크게 알린다. useAnimationQueue가 이미 관리하는 "화면상 활성 팀/플레이어"
// (displayedActiveTeam/displayedActivePlayerIndex — 정산 연출이 끝나야 실제로 바뀌는 값)를
// 그대로 재활용해서 판단하므로, 카드 연출이 아직 재생 중인데 알림이 먼저 뜨는 일이 없다.
export function TurnAnnounceBanner({
  activeTeam,
  activePlayerIndex,
  memberIds,
  myTeam,
  playerId,
}: {
  activeTeam: Team;
  activePlayerIndex: number;
  memberIds: Record<Team, string[]>;
  myTeam: Team | null;
  playerId: string | null;
}) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // "차례가 진짜로 바뀐 시점"에만 새로 띄운다 — 같은 턴 안에서 이 컴포넌트가 다시
  // 렌더되거나(예: memberIds가 매 액션마다 새 배열로 오는 것) myTeam/playerId가 초기값
  // (null)에서 뒤늦게 채워지는 경우까지 모두 감안해, 그 넷을 합친 값을 "키"로 삼는다.
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${myTeam}:${playerId}:${activeTeam}:${activePlayerIndex}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    const result = computeAnnouncement(myTeam, playerId, memberIds, activeTeam, activePlayerIndex);
    if (!result) {
      setAnnouncement(null);
      return;
    }
    const id = ++idCounter;
    setAnnouncement({ id, ...result });
    const t = setTimeout(() => {
      setAnnouncement(prev => (prev?.id === id ? null : prev));
    }, DUR_MS);
    return () => clearTimeout(t);
  }, [activeTeam, activePlayerIndex, memberIds, myTeam, playerId]);

  if (!announcement) return null;

  return (
    <div
      key={announcement.id}
      className={`turn-announce-banner turn-announce-${announcement.tier}`}
      style={announcement.style}
      aria-hidden
    >
      {announcement.text}
    </div>
  );
}
