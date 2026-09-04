import type { Animal, GameEvent, GameSettings, GameState, Place, Seat, Team } from './types';

// ─── 클라이언트 → 서버 ───────────────────────────────────────────────────────

export type ClientMessage =
  // settings는 방장(방을 만드는 쪽)만 보낸다 — 값을 정하지 않은 항목은 기본값으로 채워진다.
  // otherTeamName은 방장이 아직 아무도 들어오지 않은 "상대 팀"의 이름까지 미리 정해두는
  // 값이다(팀 이름 짓기가 방장 한쪽에만 있던 걸 보완) — 나중에 그 팀으로 실제 참가하는
  // 사람이 joinRoom에 teamName을 보내도, 이미 정해진 이름이 있으면 그쪽이 우선한다
  // (Room.assignTeamName 참고).
  //
  // team에는 관전석('spectator')도 올 수 있다. 방을 만드는 사람이 관전석을 골랐다면
  // teamName/otherTeamName은 각각 팀 1(A)·팀 2(B)의 이름으로 쓰인다.
  | { type: 'createRoom'; nickname: string; team: Seat; teamName?: string; otherTeamName?: string; settings?: Partial<GameSettings> }
  | { type: 'joinRoom'; roomId: string; nickname: string; team: Seat; teamName?: string }
  | { type: 'createSoloRoom'; nickname: string; teamName?: string; settings?: Partial<GameSettings> } // 싱글 모드 — 컴퓨터(랜덤 클릭)와 즉시 대전
  // ready는 토글이다 — 값을 생략하면 "준비 완료"로 본다(옛 클라이언트 호환).
  | { type: 'ready'; ready?: boolean }
  | { type: 'leaveRoom' } // 대기실에서 스스로 나가기(연결은 유지한 채 방만 벗어난다)
  // ─ 아래는 방장 전용 명령 (단, movePlayer는 자기 자신을 옮길 때만 누구나 쓸 수 있다) ─
  // 대상 지정에는 playerId가 아니라 방 안에서만 통하는 공개 식별자(memberId)를 쓴다 —
  // playerId는 재접속 자격증명이라 다른 참가자에게 노출하면 세션을 가로챌 수 있다.
  | { type: 'movePlayer'; targetMemberId: string; team: Seat } // 관전석으로 보내는 것도 "자리 이동"이다
  | { type: 'kickPlayer'; targetMemberId: string }
  | { type: 'transferHost'; targetMemberId: string }
  | { type: 'setTeamName'; team: Team; name: string }
  | { type: 'updateSettings'; settings: Partial<GameSettings> }
  | { type: 'startGame' } // 방장이 직접 시작(모두 준비 완료 + 양 팀에 한 명 이상일 때만)
  | { type: 'chat'; text: string } // 대기실 채팅 — 게임이 시작된 뒤에는 서버가 무시한다
  | { type: 'drawCard'; place: Place }
  | { type: 'chooseSkill'; animal: Animal } // 턴 종료 시 4가지 스킬 중 하나 선택
  | { type: 'passSkill' } // 턴 종료 시 "아무것도 하지 않음" 선택
  | { type: 'reconnect'; roomId: string; playerId: string };

// ─── 서버 → 클라이언트 ──────────────────────────────────────────────────────

export type ServerMessage =
  // 로비 — memberId는 이 방 안에서 나를 가리키는 공개 식별자다(playerId는 재접속
  // 자격증명이라 남에게 보이면 안 되므로, 방장 명령의 대상 지정에는 이 값을 쓴다).
  | { type: 'roomCreated'; roomId: string; playerId: string; memberId: string }
  | { type: 'roomJoined'; roomId: string; playerId: string; memberId: string }
  | {
      type: 'lobbyState';
      players: LobbyPlayer[];
      teamNames: Record<Team, string | null>;
      settings: GameSettings;
      hostMemberId: string | null;
    }
  | { type: 'kicked'; message: string }   // 방장에게 추방당해 방에서 나갔음
  | { type: 'leftRoom' }                  // 스스로 나가기(leaveRoom) 완료
  | { type: 'chatMessage'; message: LobbyChatMessage }     // 새 대기실 채팅 1건
  | { type: 'chatHistory'; messages: LobbyChatMessage[] }  // 입장·재접속 시 최근 기록 전체
  | { type: 'error'; code: ErrorCode; message: string }
  // 게임
  | { type: 'gameStart'; state: ClientGameState }
  | { type: 'gameSnapshot'; state: ClientGameState }   // 재접속용
  | { type: 'actionResult'; events: ClientGameEvent[]; state: ClientGameState };

export interface LobbyPlayer {
  memberId: string;
  nickname: string;
  team: Seat;      // 'spectator'면 관전석에 앉아 있다는 뜻(게임에 참여하지 않는다)
  ready: boolean;  // 관전자는 준비할 것이 없으므로 서버가 항상 true로 유지한다
  connected: boolean;
}

/**
 * 대기실 채팅 한 줄. `kind: 'system'`은 사람이 친 말이 아니라 방에서 일어난 일
 * (입장·퇴장·추방·팀 변경·방장 위임·규칙 변경)을 알리는 안내줄이다.
 *
 * 시각(타임스탬프)은 일부러 싣지 않는다 — 서버 시계의 절대 시각을 그대로 보내면
 * 클라이언트 PC 시계가 어긋난 만큼 표시가 틀어지고(턴 타이머에서 이미 겪은 문제),
 * 대기실은 몇 분짜리 화면이라 시각 표시가 그 복잡도만큼의 값어치가 없다.
 */
export interface LobbyChatMessage {
  id: number;              // 방 안에서 1부터 증가 — React key이자 중복 수신 방어 기준
  kind: 'chat' | 'system';
  memberId: string | null; // system이면 null
  nickname: string;        // system이면 ''
  team: Seat | null;       // 닉네임을 자리 색으로 칠하는 용도, system이면 null
  // 이 말을 할 때 방장이었는지 — 닉네임 앞 👑 표시에 쓴다. "지금" 방장인지를 화면에서
  // 다시 계산하지 않고 서버가 그 순간의 값을 박아 보내므로, 나중에 방장이 바뀌어도
  // 지난 대화의 왕관은 말했던 그 사람에게 그대로 남는다.
  wasHost: boolean;
  text: string;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NICKNAME_TAKEN'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_AVAILABLE'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_RECONNECT'
  | 'NO_PENDING_CHOICE'
  | 'NOT_HOST'          // 방장만 쓸 수 있는 명령을 방장이 아닌 사람이 보냈다
  | 'PLAYER_NOT_FOUND'  // 방장 명령의 대상(memberId)이 방에 없다
  | 'TEAM_NAME_TAKEN'   // 바꾸려는 팀 이름이 상대 팀과 겹친다
  | 'CANNOT_START';     // 아직 시작 조건(양 팀 한 명 이상 + 전원 준비)을 못 채웠다

// ─── 클라이언트 게임 상태 ─────────────────────────────────────────────────────
// 카드가 뽑히는 즉시 공개되므로(숨겨진 카드 상태가 없음) 서버 GameState를 그대로
// 확장해서 쓴다 — 예전처럼 별도의 클라이언트 전용 board 직렬화가 필요 없다.

export interface ClientGameState extends GameState {
  activePlayerNickname: string;
  // 남은 턴 제한시간(ms) — 서버가 이 상태를 직렬화하는 순간을 기준으로 잰 "상대 시간"이다.
  // 예전에는 서버 시계의 절대 시각(turnDeadline)을 그대로 보냈는데, 그러면 클라이언트 PC
  // 시계가 서버와 어긋난 만큼 표시가 그대로 틀어졌다(엉뚱한 숫자에서 시작해 0에 멈춰
  // 있는데도 턴은 계속 흐르는 증상). 상대 시간으로 보내고 클라이언트가 자기 시계로
  // 데드라인을 다시 계산하면 시계 오차의 영향을 받지 않는다.
  turnRemainingMs: number;
  // 타이머 게이지 100%에 해당하는 시간(ms) — 방 설정값(drawTimeSec/actionTimeSec/
  // noActionTimeSec)에 실용신양·도토리 축제 예약 뽑기로 늘어난 시간까지 더한, 이번 턴에
  // 실제로 주어진 시간이다. 클라이언트가 방 설정값만 보고 게이지 폭을 정하면 늘어난
  // 시간을 반영하지 못해 눈금과 숫자가 어긋나므로 서버가 직접 알려준다.
  // (연출 유예 시간은 여기에 포함하지 않는다 — 아래 turnRemainingMs가 이 값을 잠시
  //  넘을 수 있고, 그 구간에는 게이지가 가득 찬 상태로 표시된다.)
  turnTotalMs: number;
  teamNames: Record<Team, string>; // 방장이 정했거나 무작위로 배정된 팀 이름("A팀"/"B팀" 대신 표시)
  memberIds: Record<Team, string[]>; // teams[team].members와 같은 순서의 playerId — 클라이언트가 "지금 활성 플레이어가 바로 나인지"를 판별하는 데 쓴다
}

export type ClientGameEvent = GameEvent;
