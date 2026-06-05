import { useEffect } from "react";
import { useApp } from "./store/app";
import { Rail } from "./components/Rail";
import { Header } from "./components/Header";
import { ChatView } from "./components/ChatView";
import { SettingsView } from "./components/SettingsView";
import { onChatDelta, onChatDone, onChatError } from "./lib/tauri";

export default function App() {
  const view = useApp((s) => s.view);

  useEffect(() => {
    const { appendDelta, finishStream, failStream } = useApp.getState();
    const unlisteners: Array<() => void> = [];
    let active = true;
    const track = (p: Promise<() => void>) =>
      p.then((u) => {
        if (active) unlisteners.push(u);
        else u();
      });

    void track(onChatDelta((e) => appendDelta(e.request_id, e.content)));
    void track(onChatDone((e) => finishStream(e.request_id)));
    void track(onChatError((e) => failStream(e.request_id, e.message)));

    // Load the reasoning-capable model catalogue (models.dev) once.
    void useApp.getState().loadReasoningModels();

    return () => {
      active = false;
      unlisteners.forEach((u) => u());
    };
  }, []);

  return (
    <div className="flex h-full">
      <Rail />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Header />
        <ChatView />
        {view === "settings" && <SettingsView />}
      </div>
    </div>
  );
}
