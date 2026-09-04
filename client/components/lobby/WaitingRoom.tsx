'use client';

import { useEffect, useState } from 'react';
import type { GameSettings, LobbyChatMessage, LobbyPlayer, Seat, Team } from 'shared';
import { SEATS, SPECTATOR, TEAM_NAME_MAX_LEN, isPlayingSeat, randomTeamName } from 'shared';
import { SEAT_META, seatLabel } from '@/lib/seatInfo';
import { GameRulesInputs, RuleSummary } from './GameRulesFields';
import { ChatPanel } from './ChatPanel';

/** 초대 링크 — 로비 첫 화면(`/`)을 방 코드가 채워진 "방 참가하기" 상태로 열어준다. */
function inviteUrl(roomId: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/?room=${roomId}`;
}

/**
 * 클립보드 복사. navigator.clipboard는 보안 컨텍스트(https 또는 localhost)에서만 쓸 수
 * 있어서, 사내망 http 주소로 접속한 경우엔 실패한다 — 그럴 때를 대비해 임시 textarea +
 * execCommand로 한 번 더 시도한다.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 아래 폴백으로 넘어간다 */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface WaitingRoomProps {
  roomId: string;
  players: LobbyPlayer[];
  teamNames: Record<Team, string | null>;
  settings: GameSettings;
  myMemberId: string | null;
  hostMemberId: string | null;
  isHost: boolean;
  chatLog: LobbyChatMessage[];
  connected: boolean;
  onSendChat: (text: string) => void;
  onReady: (ready: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onMove: (targetMemberId: string, team: Seat) => void;
  onKick: (targetMemberId: string) => void;
  onTransferHost: (targetMemberId: string) => void;
  onRenameTeam: (team: Team, name: string) => void;
  onUpdateSettings: (settings: GameSettings) => void;
}

export function WaitingRoom({
  roomId, players, teamNames, settings,
  myMemberId, hostMemberId, isHost, chatLog, connected, onSendChat,
  onReady, onStart, onLeave, onMove, onKick, onTransferHost, onRenameTeam, onUpdateSettings,
}: WaitingRoomProps) {
  const me = players.find(p => p.memberId === myMemberId) ?? null;
  const teamA = players.filter(p => p.team === 'A');
  const teamB = players.filter(p => p.team === 'B');
  const spectators = players.filter(p => !isPlayingSeat(p.team));
  const iAmSpectator = me !== null && !isPlayingSeat(me.team);

  // 방장이 시작 버튼을 누를 수 있는지 — 서버(Room.startBlockReason)와 같은 조건을
  // 화면에도 그대로 보여줘서, 왜 아직 시작할 수 없는지 방장이 바로 알 수 있게 한다.
  // 관전자는 인원수에도, 준비 여부에도 영향을 주지 않는다(서버가 항상 준비 완료로 둔다).
  const blockReason =
    teamA.length === 0 || teamB.length === 0
      ? '양 팀에 각각 한 명 이상 있어야 해요. (관전자는 인원에 들어가지 않아요)'
      : players.some(p => !p.ready)
        ? '아직 준비하지 않은 참가자가 있어요.'
        : teamNames.A !== null && teamNames.A === teamNames.B
          ? '양 팀 이름이 같아요. 한쪽 이름을 바꿔주세요.'
          : null;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 sm:p-10 w-full max-w-4xl flex flex-col gap-6">
      <RoomCodeHeader roomId={roomId} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(['A', 'B'] as Team[]).map(team => (
          <TeamColumn
            key={team}
            team={team}
            name={teamNames[team]}
            otherName={teamNames[team === 'A' ? 'B' : 'A']}
            players={team === 'A' ? teamA : teamB}
            myMemberId={myMemberId}
            hostMemberId={hostMemberId}
            isHost={isHost}
            onMove={onMove}
            onKick={onKick}
            onTransferHost={onTransferHost}
            onRenameTeam={onRenameTeam}
          />
        ))}
      </div>

      <SpectatorRow
        players={spectators}
        myMemberId={myMemberId}
        hostMemberId={hostMemberId}
        isHost={isHost}
        onMove={onMove}
        onKick={onKick}
        onTransferHost={onTransferHost}
      />

      <ChatPanel
        messages={chatLog}
        myMemberId={myMemberId}
        connected={connected}
        onSend={onSendChat}
      />

      {/* 준비/시작 버튼이 규칙 패널보다 먼저 온다 — 대화창이 생기면서 화면이 길어진 뒤로,
          규칙을 아래에 두지 않으면 정작 가장 자주 누르는 버튼이 스크롤 밖으로 밀려난다. */}
      {isHost ? (
        <div className="flex flex-col gap-2">
          <button
            onClick={onStart}
            disabled={blockReason !== null}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            👑 게임 시작
          </button>
          {blockReason && <p className="text-center text-base text-gray-400">{blockReason}</p>}
        </div>
      ) : iAmSpectator ? (
        // 관전자는 준비할 것이 없다(서버도 항상 준비 완료로 둔다) — 준비 버튼 대신
        // 지금 어떤 상태인지만 알려준다.
        <p className="text-center text-lg text-purple-500 bg-purple-50 border border-purple-200 rounded-xl py-4">
          👀 관전자로 참가했어요. 방장이 시작하면 양 팀의 대결을 지켜볼 수 있어요.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onReady(!me?.ready)}
            className={`font-semibold text-xl py-4 rounded-xl transition text-white ${
              me?.ready ? 'bg-green-300 hover:bg-green-400' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {me?.ready ? '준비 완료 ✓ (누르면 취소)' : '준비'}
          </button>
          <p className="text-center text-base text-gray-400">
            방장이 시작 버튼을 누르면 게임이 시작돼요.
          </p>
        </div>
      )}

      {isHost ? (
        <HostRulesPanel settings={settings} teamNames={teamNames} onApply={onUpdateSettings} />
      ) : (
        <RuleSummary settings={settings} teamNames={teamNames} />
      )}

      <button onClick={onLeave} className="text-lg text-gray-400 hover:text-gray-600">
        ← 방 나가기
      </button>
    </div>
  );
}

// ─── 방 코드 / 초대 링크 ──────────────────────────────────────────────────────

function RoomCodeHeader({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | 'fail' | null>(null);

  useEffect(() => {
    if (copied === null) return;
    const t = setTimeout(() => setCopied(null), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async (what: 'code' | 'link') => {
    const ok = await copyText(what === 'code' ? roomId : inviteUrl(roomId));
    setCopied(ok ? what : 'fail');
  };

  return (
    <div className="text-center">
      <p className="text-lg text-gray-400">방 코드</p>
      <p className="text-6xl font-mono font-bold text-green-700 tracking-widest">{roomId}</p>
      <div className="flex flex-wrap gap-2 justify-center mt-3">
        <button
          onClick={() => copy('link')}
          className="bg-green-600 hover:bg-green-700 text-white text-base font-semibold px-4 py-2 rounded-lg transition"
        >
          🔗 초대 링크 복사
        </button>
        <button
          onClick={() => copy('code')}
          className="bg-gray-100 hover:bg-gray-200 text-gray-600 text-base font-semibold px-4 py-2 rounded-lg transition"
        >
          📋 방 코드 복사
        </button>
      </div>
      <p className="text-base text-gray-400 mt-2 h-6">
        {copied === 'link'
          ? '초대 링크를 복사했어요! 붙여넣기로 친구에게 보내세요.'
          : copied === 'code'
            ? '방 코드를 복사했어요!'
            : copied === 'fail'
              ? '복사에 실패했어요. 위 코드를 직접 알려주세요.'
              : '초대 링크를 열면 방 코드가 자동으로 입력돼요.'}
      </p>
    </div>
  );
}

// ─── 팀 목록 ─────────────────────────────────────────────────────────────────

function TeamColumn({
  team, name, otherName, players, myMemberId, hostMemberId, isHost,
  onMove, onKick, onTransferHost, onRenameTeam,
}: {
  team: Team;
  name: string | null;
  otherName: string | null;
  players: LobbyPlayer[];
  myMemberId: string | null;
  hostMemberId: string | null;
  isHost: boolean;
  onMove: (targetMemberId: string, team: Seat) => void;
  onKick: (targetMemberId: string) => void;
  onTransferHost: (targetMemberId: string) => void;
  onRenameTeam: (team: Team, name: string) => void;
}) {
  const meta = SEAT_META[team];

  return (
    <div className={`bg-gray-50 rounded-xl p-4 min-h-[140px] border ${meta.border}`}>
      <TeamNameRow
        team={team}
        name={name}
        otherName={otherName}
        canEdit={isHost}
        onRename={onRenameTeam}
      />

      {players.length === 0 ? (
        <p className="text-base text-gray-400 mt-2">아직 아무도 없어요</p>
      ) : (
        <div className="flex flex-col gap-1 mt-2">
          {players.map(p => (
            <PlayerRow
              key={p.memberId}
              player={p}
              isMe={p.memberId === myMemberId}
              isTheHost={p.memberId === hostMemberId}
              viewerIsHost={isHost}
              onMove={onMove}
              onKick={onKick}
              onTransferHost={onTransferHost}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 관전석 — 두 팀 칸 아래에 가로로 길게 붙는 제3의 자리. 여기 앉은 사람은 게임에
 * 참여하지 않고 구경만 하므로 준비 표시도, 인원수 계산도 따로 하지 않는다.
 */
function SpectatorRow({
  players, myMemberId, hostMemberId, isHost, onMove, onKick, onTransferHost,
}: {
  players: LobbyPlayer[];
  myMemberId: string | null;
  hostMemberId: string | null;
  isHost: boolean;
  onMove: (targetMemberId: string, team: Seat) => void;
  onKick: (targetMemberId: string) => void;
  onTransferHost: (targetMemberId: string) => void;
}) {
  return (
    <div className={`bg-gray-50 rounded-xl px-4 py-3 border ${SEAT_META[SPECTATOR].border}`}>
      {/* 아무도 없을 때는 한 줄로만 남긴다 — 대기실은 이미 길어서(팀·채팅·규칙) 빈 칸이
          자리를 크게 차지하면 정작 자주 누르는 버튼이 스크롤 밖으로 밀린다. */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="font-semibold text-gray-700 text-lg">
          {seatLabel(SPECTATOR)}
          {players.length > 0 && ` (${players.length}명)`}
        </p>
        <p className="text-base text-gray-400">
          {players.length === 0
            ? '아직 관전자가 없어요 — 구경만 하려면 이름 옆 "👀 관전자"를 누르세요'
            : '게임에 참여하지 않고 구경만 해요'}
        </p>
      </div>

      {players.length > 0 && (
        <div className="flex flex-col gap-1 mt-2">
          {players.map(p => (
            <PlayerRow
              key={p.memberId}
              player={p}
              isMe={p.memberId === myMemberId}
              isTheHost={p.memberId === hostMemberId}
              viewerIsHost={isHost}
              onMove={onMove}
              onKick={onKick}
              onTransferHost={onTransferHost}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamNameRow({
  team, name, otherName, canEdit, onRename,
}: {
  team: Team;
  name: string | null;
  otherName: string | null;
  canEdit: boolean;
  onRename: (team: Team, name: string) => void;
}) {
  const meta = SEAT_META[team];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name ?? '');

  // 편집 중이 아닐 때만 서버 값을 따라간다 — 입력 도중에 다른 사람의 lobbyState가
  // 도착해도 타이핑하던 글자가 날아가지 않게.
  useEffect(() => {
    if (!editing) setDraft(name ?? '');
  }, [name, editing]);

  const submit = () => {
    onRename(team, draft);
    setEditing(false);
  };

  // 상대 팀 이름과 겹치는 이름은 서버가 거절하므로, 주사위도 그 이름은 피해서 뽑는다.
  const clash = draft.trim().length > 0 && draft.trim() === otherName;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-lg">{meta.badge}</span>
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !clash) submit();
            if (e.key === 'Escape') setEditing(false);
          }}
          maxLength={TEAM_NAME_MAX_LEN}
          placeholder="비우면 무작위"
          className={`input-base flex-1 min-w-0 !py-1.5 ${clash ? '!border-red-300' : ''}`}
        />
        <button
          onClick={() => setDraft(randomTeamName(otherName))}
          title="팀 이름 무작위로 뽑기"
          aria-label="팀 이름 무작위로 뽑기"
          className="text-base px-2 py-1.5 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 active:scale-95 transition shrink-0"
        >
          🎲
        </button>
        <button
          onClick={submit}
          disabled={clash}
          title={clash ? '상대 팀과 같은 이름은 쓸 수 없어요' : undefined}
          className="text-base font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 px-2.5 py-1.5 rounded-lg shrink-0"
        >
          저장
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-base text-gray-400 hover:text-gray-600 px-1 shrink-0"
        >
          취소
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="font-semibold text-gray-700 text-lg truncate">
        {meta.badge} {name ?? `${meta.label} (미정)`}
      </p>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          title="팀 이름 바꾸기"
          className="text-base text-gray-400 hover:text-gray-600 shrink-0"
        >
          ✏️
        </button>
      )}
    </div>
  );
}

function PlayerRow({
  player, isMe, isTheHost, viewerIsHost,
  onMove, onKick, onTransferHost,
}: {
  player: LobbyPlayer;
  isMe: boolean;
  isTheHost: boolean;
  viewerIsHost: boolean;
  onMove: (targetMemberId: string, team: Seat) => void;
  onKick: (targetMemberId: string) => void;
  onTransferHost: (targetMemberId: string) => void;
}) {
  // 추방·방장 위임은 되돌릴 수 없으니 한 번 더 묻는다(같은 버튼이 "정말?"로 바뀐다).
  const [confirming, setConfirming] = useState<'kick' | 'host' | null>(null);

  useEffect(() => {
    if (confirming === null) return;
    const t = setTimeout(() => setConfirming(null), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  // 자리 이동은 방장이 아무나, 그 외에는 자기 자신만 할 수 있다(서버도 같은 규칙).
  // 지금 앉아 있는 자리를 뺀 나머지(다른 팀 + 관전석)가 옮겨갈 수 있는 곳이다.
  const canMove = viewerIsHost || isMe;
  const canManage = viewerIsHost && !isMe;
  const moveTargets = SEATS.filter(s => s !== player.team);
  const isSpectator = !isPlayingSeat(player.team);

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        title={
          !player.connected
            ? '연결이 끊겼어요'
            : isSpectator
              ? '관전자 (준비 없이 바로 지켜봐요)'
              : player.ready
                ? '준비 완료'
                : '준비 중'
        }
        className={`w-2 h-2 rounded-full shrink-0 ${
          !player.connected ? 'bg-red-300' : isSpectator ? 'bg-purple-400' : player.ready ? 'bg-green-500' : 'bg-gray-300'
        }`}
      />
      <span className={`text-lg truncate ${isMe ? 'text-green-700 font-semibold' : 'text-gray-700'}`}>
        {isTheHost && '👑 '}
        {player.nickname}
        {isMe && ' (나)'}
      </span>

      <span className="flex-1" />

      {confirming !== null ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              if (confirming === 'kick') onKick(player.memberId);
              else onTransferHost(player.memberId);
              setConfirming(null);
            }}
            className="text-sm font-semibold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded"
          >
            {confirming === 'kick' ? '정말 내보내기' : '정말 넘기기'}
          </button>
          <button
            onClick={() => setConfirming(null)}
            className="text-sm text-gray-400 hover:text-gray-600 px-1"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 shrink-0">
          {canMove &&
            moveTargets.map(seat => (
              <button
                key={seat}
                onClick={() => onMove(player.memberId, seat)}
                title={`${SEAT_META[seat].label}(으)로 옮기기`}
                className="text-sm text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 px-2 py-1 rounded"
              >
                {seatLabel(seat)}
              </button>
            ))}
          {canManage && (
            <>
              <button
                onClick={() => setConfirming('host')}
                title="방장 넘기기"
                className="text-sm text-gray-500 bg-white border border-gray-200 hover:bg-gray-100 px-2 py-1 rounded"
              >
                👑
              </button>
              <button
                onClick={() => setConfirming('kick')}
                title="내보내기"
                className="text-sm text-red-400 bg-white border border-gray-200 hover:bg-red-50 px-2 py-1 rounded"
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 방장용 규칙 편집 ────────────────────────────────────────────────────────

function HostRulesPanel({
  settings, teamNames, onApply,
}: {
  settings: GameSettings;
  teamNames: Record<Team, string | null>;
  onApply: (next: GameSettings) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<GameSettings>(settings);

  // 패널을 닫아둔 동안에는 서버 값을 그대로 따라가고, 열려 있는 동안에는 방장이 고치던
  // 값을 유지한다(숫자를 입력하는 중에 다른 사람의 lobbyState가 덮어쓰지 않도록).
  useEffect(() => {
    if (!open) setDraft(settings);
  }, [settings, open]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="border border-gray-200 rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-lg font-semibold text-gray-600"
      >
        <span>⚙️ 게임 규칙 바꾸기</span>
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open ? (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 flex flex-col gap-3">
          <GameRulesInputs settings={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <button
              onClick={() => onApply(draft)}
              disabled={!dirty}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-lg py-2.5 rounded-lg transition"
            >
              {dirty ? '규칙 적용' : '적용됨 ✓'}
            </button>
            <button
              onClick={() => setDraft(settings)}
              disabled={!dirty}
              className="text-lg text-gray-400 hover:text-gray-600 disabled:text-gray-300 px-4"
            >
              되돌리기
            </button>
          </div>
          <p className="text-sm text-gray-400">
            적용하면 대기실의 모든 참가자에게 바뀐 규칙이 바로 보여요.
          </p>
        </div>
      ) : (
        <div className="px-2 pb-3">
          <RuleSummary settings={settings} teamNames={teamNames} />
        </div>
      )}
    </div>
  );
}
