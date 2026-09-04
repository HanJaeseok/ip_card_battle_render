import type { Seat } from 'shared';
import { SPECTATOR } from 'shared';

/**
 * 로비에서 "자리"(팀 1 / 팀 2 / 관전석)를 부르는 이름과 배지.
 * 참가 화면(app/page.tsx)과 대기실(components/lobby/WaitingRoom.tsx)이 같은 값을 써야
 * "방 만들 때 고른 자리"와 "대기실에 앉아 있는 자리"가 같은 말로 보인다.
 */
export const SEAT_META: Record<Seat, { badge: string; label: string; border: string }> = {
  A: { badge: '🟢', label: '팀 1', border: 'border-green-200' },
  B: { badge: '🔵', label: '팀 2', border: 'border-blue-200' },
  [SPECTATOR]: { badge: '👀', label: '관전자', border: 'border-purple-200' },
};

/** 버튼·안내문에 쓰는 "🟢 팀 1" 형태의 한 덩어리 이름. */
export function seatLabel(seat: Seat): string {
  return `${SEAT_META[seat].badge} ${SEAT_META[seat].label}`;
}
