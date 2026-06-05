import { useEffect, useRef } from "react";
import { useCurrentMessages } from "../store/app";
import { MessageBubble } from "./MessageBubble";
import { Composer } from "./Composer";

export function ChatView() {
  const messages = useCurrentMessages();
  const empty = messages.length === 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevCount.current;
    prevCount.current = messages.length;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (grew || nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <main className="relative min-w-0 flex-1 overflow-hidden bg-[var(--color-bg)]">
      {!empty && (
        <div ref={scrollRef} className="absolute inset-0 overflow-y-auto">
          <div className="mx-auto flex max-w-[760px] flex-col gap-[22px] px-4 pb-[180px] pt-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} m={m} />
            ))}
          </div>
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 transition-all duration-500 ease-out ${
          empty ? "bottom-1/2 translate-y-1/2" : "bottom-0 translate-y-0"
        }`}
      >
        <div className="pointer-events-auto bg-[var(--color-bg)] pb-0 pt-2">
          <Composer />
        </div>
      </div>
    </main>
  );
}
