'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LobbyChatMessage } from 'shared';
import { CHAT_MAX_LEN, CHAT_MIN_INTERVAL_MS, SPECTATOR } from 'shared';

// 목록 맨 아래에서 이만큼(px) 안쪽이면 "지금 최신 대화를 보고 있다"고 본다.
const STICK_TO_BOTTOM_PX = 40;

export interface ChatPanelProps {
  messages: LobbyChatMessage[];
  myMemberId: string | null;
  connected: boolean;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, myMemberId, connected, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  // 방금 보냈는지 — 서버가 과속 메시지를 조용히 버리므로, 화면에서 먼저 막아
  // "쳤는데 아무것도 안 뜬다"는 상황이 생기지 않게 한다.
  const [cooling, setCooling] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // 사용자가 맨 아래(=최신 대화)를 보고 있는지. 스크롤할 때마다 갱신해두고, 새 메시지가
  // 붙는 순간에는 이 값을 그대로 읽는다 — 메시지가 이미 추가된 뒤에 위치를 재면 목록이
  // 길어진 만큼 늘 "위로 올라가 있다"고 잘못 판정된다.
  const atBottomRef = useRef(true);

  // 맨 아래를 보고 있었을 때만 따라 내려간다 — 지난 대화를 읽으려고 위로 올려둔 사람의
  // 화면을 새 메시지가 도착할 때마다 끌어내리면 읽을 수가 없다.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !atBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!cooling) return;
    const t = setTimeout(() => setCooling(false), CHAT_MIN_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [cooling]);

  const canSend = connected && !cooling && draft.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(draft.trim());
    setDraft('');
    setCooling(true);
    // 보낸 뒤에는 무조건 최신 대화를 보여준다(내가 친 말이 화면 밖에 있으면 이상하다).
    atBottomRef.current = true;
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <p className="px-4 py-2.5 text-lg font-semibold text-gray-600 bg-gray-50 border-b border-gray-100">
        💬 대기실 채팅
      </p>

      <div
        ref={listRef}
        onScroll={e => {
          const el = e.currentTarget;
          atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;
        }}
        className="h-48 overflow-y-auto px-4 py-3 flex flex-col gap-1"
      >
        {messages.length === 0 ? (
          <p className="text-base text-gray-400 m-auto">아직 대화가 없어요. 먼저 인사해 보세요!</p>
        ) : (
          messages.map(m => <ChatLine key={m.id} message={m} isMine={m.memberId === myMemberId} />)
        )}
      </div>

      <div className="flex gap-2 px-3 py-3 border-t border-gray-100">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            // isComposing 검사가 없으면 한글을 치고 Enter를 눌렀을 때 "조합 확정 Enter"까지
            // 같이 먹혀 같은 메시지가 두 번 전송된다.
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          maxLength={CHAT_MAX_LEN}
          disabled={!connected}
          placeholder={connected ? '메시지를 입력하세요' : '서버에 연결 중...'}
          className="input-base flex-1 min-w-0 !py-2"
        />
        <button
          onClick={submit}
          disabled={!canSend}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-semibold text-base px-4 rounded-lg shrink-0 transition"
        >
          전송
        </button>
      </div>
    </div>
  );
}

function ChatLine({ message, isMine }: { message: LobbyChatMessage; isMine: boolean }) {
  if (message.kind === 'system') {
    return <p className="text-sm text-gray-400 text-center py-0.5">{message.text}</p>;
  }

  // 관전자(팀이 A도 B도 아닌 사람)는 두 팀 색 어느 쪽도 아니어야 헷갈리지 않는다.
  const nameColor =
    message.team === 'A' ? 'text-green-700' : message.team === 'B' ? 'text-blue-600' : 'text-purple-500';

  return (
    <p className="text-base leading-relaxed break-words">
      <span className={`mr-2 ${nameColor} ${isMine ? 'font-bold' : 'font-semibold'}`}>
        {message.wasHost && '👑 '}
        {message.team === SPECTATOR && '👀 '}
        {message.nickname}
      </span>
      <span className="text-gray-700">{message.text}</span>
    </p>
  );
}
