import type { ServerMessage } from 'shared';
import { SPECTATOR } from 'shared';
import { Room } from '../room';

/**
 * 관전자(제3의 자리) 규칙 — 로비에서 "팀 1 / 팀 2 / 관전자" 중 관전석을 고른 사람은
 * 게임에 아무 영향도 주지 않고 구경만 한다. 여기서는 그 "영향을 주지 않음"이 실제로
 * 지켜지는지(인원수·준비 상태·조작 권한)를 방(Room) 단위로 확인한다.
 *
 * 게임을 시작하면 방이 실제 턴 타이머(setTimeout)를 걸므로 가짜 타이머를 쓴다 —
 * 그러지 않으면 테스트가 끝나도 30초짜리 타이머가 남아 프로세스가 붙들린다.
 */

interface FakeSocket {
  readyState: number;
  sent: ServerMessage[];
  send(data: string): void;
}

function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return {
    readyState: 1, // OPEN
    sent,
    send(data: string) {
      sent.push(JSON.parse(data) as ServerMessage);
    },
  };
}

/** 그 소켓이 마지막으로 받은 특정 타입 메시지(없으면 undefined). */
function lastOf<T extends ServerMessage['type']>(
  ws: FakeSocket,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    if (ws.sent[i].type === type) return ws.sent[i] as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

/** 관전 방장 1명 + A팀 1명 + B팀 1명이 들어와 있는 대기실. */
function setupRoom() {
  const host = fakeSocket();
  const alice = fakeSocket();
  const bob = fakeSocket();
  const room = new Room('TEST', () => {});

  // 방장이 관전석에 앉으면 "우리 팀"이 없으므로 두 팀 이름 입력칸이 그대로 팀 1·팀 2가 된다.
  room.addPlayer(host as never, 'p-host', '관전방장', SPECTATOR, '민트팀', undefined, '핑크팀');
  room.addPlayer(alice as never, 'p-alice', '앨리스', 'A');
  room.addPlayer(bob as never, 'p-bob', '밥', 'B');

  return { room, host, alice, bob };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('관전자 자리', () => {
  it('관전석으로 방을 만들어도 양 팀 이름이 모두 정해진다', () => {
    const { host } = setupRoom();
    const lobby = lastOf(host, 'lobbyState')!;
    expect(lobby.teamNames).toEqual({ A: '민트팀', B: '핑크팀' });
  });

  it('관전자는 처음부터 준비 완료이고, 준비를 내릴 수 없다', () => {
    const { room, host, alice } = setupRoom();
    // 관전자로 참가한 사람(방장이 아닌 쪽)도 마찬가지인지 함께 본다.
    const watcher = fakeSocket();
    room.addPlayer(watcher as never, 'p-watch', '구경꾼', SPECTATOR);
    room.setReady('p-watch', false);

    const players = lastOf(host, 'lobbyState')!.players;
    expect(players.find(p => p.nickname === '구경꾼')).toMatchObject({ team: SPECTATOR, ready: true });
    // 실제로 뛰는 사람은 여전히 준비를 눌러야 한다.
    expect(players.find(p => p.nickname === '앨리스')!.ready).toBe(false);
    expect(alice.sent.some(m => m.type === 'gameStart')).toBe(false);
  });

  it('관전자가 몇 명이든 양 팀이 준비되면 게임이 시작되고, 관전자도 게임 화면을 받는다', () => {
    const { room, host, alice, bob } = setupRoom();
    room.addPlayer(fakeSocket() as never, 'p-watch', '구경꾼', SPECTATOR);

    room.setReady('p-alice', true);
    room.setReady('p-bob', true);
    room.startGame('p-host');

    for (const ws of [host, alice, bob]) {
      expect(lastOf(ws, 'gameStart')).toBeDefined();
    }
    // 관전자는 팀 구성원에 섞이지 않는다.
    const state = lastOf(host, 'gameStart')!.state;
    expect(state.teams.A.members).toEqual(['앨리스']);
    expect(state.teams.B.members).toEqual(['밥']);
    expect(state.memberIds.A).toEqual(['p-alice']);
  });

  it('양 팀 중 한쪽이 비어 있으면 관전자만 늘어나도 시작할 수 없다', () => {
    const host = fakeSocket();
    const room = new Room('TEST', () => {});
    room.addPlayer(host as never, 'p-host', '방장', 'A');
    room.addPlayer(fakeSocket() as never, 'p-w1', '구경1', SPECTATOR);
    room.addPlayer(fakeSocket() as never, 'p-w2', '구경2', SPECTATOR);

    room.startGame('p-host');
    expect(lastOf(host, 'error')!.code).toBe('CANNOT_START');
    expect(host.sent.some(m => m.type === 'gameStart')).toBe(false);
  });

  it('관전자는 게임을 조작할 수 없다', () => {
    const { room, host } = setupRoom();
    room.setReady('p-alice', true);
    room.setReady('p-bob', true);
    room.startGame('p-host');
    host.sent.length = 0;

    room.handleDrawCard('p-host', 'house');
    room.handleChooseSkill('p-host', 'sheep');
    room.handlePassSkill('p-host');

    const errors = host.sent.filter(m => m.type === 'error');
    expect(errors).toHaveLength(3);
    for (const e of errors) {
      expect(e).toMatchObject({ code: 'NOT_YOUR_TURN', message: '관전자는 게임에 참여할 수 없습니다.' });
    }
    // 조작이 통째로 무시됐으므로 게임 상태를 바꾸는 브로드캐스트도 없어야 한다.
    expect(host.sent.some(m => m.type === 'actionResult')).toBe(false);
  });

  it('관전석에서 팀으로 나오면 다시 준비를 눌러야 한다', () => {
    const { room, host } = setupRoom();
    const watcher = fakeSocket();
    room.addPlayer(watcher as never, 'p-watch', '구경꾼', SPECTATOR);
    const watcherMemberId = lastOf(host, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')!.memberId;

    room.movePlayer('p-watch', watcherMemberId, 'B');
    expect(lastOf(host, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')).toMatchObject({
      team: 'B',
      ready: false,
    });

    // 팀끼리 옮기는 것만으로는 준비 상태를 건드리지 않는다(관전석이 생기기 전과 동일).
    room.setReady('p-watch', true);
    room.movePlayer('p-watch', watcherMemberId, 'A');
    expect(lastOf(host, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')).toMatchObject({
      team: 'A',
      ready: true,
    });

    // 다시 관전석으로 돌아가면 준비할 것이 없으니 자동으로 준비 완료가 된다.
    room.movePlayer('p-watch', watcherMemberId, SPECTATOR);
    expect(lastOf(host, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')).toMatchObject({
      team: SPECTATOR,
      ready: true,
    });
  });
});
