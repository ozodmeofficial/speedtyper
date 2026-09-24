"use client";

import { useEffect } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { useT } from "@/components/providers/I18nProvider";
import { useRace } from "./useRace";
import { Lobby } from "./Lobby";
import { RoomScreen } from "./RoomScreen";
import type { DictKey } from "@/lib/i18n";
import "./race.css";

export function RaceApp({ initialCode }: { initialCode: string | null }) {
  const t = useT();
  const { user } = useApp();
  const { status, lobby, room, me, error, setError, send, setLobbyOn, smoother } = useRace(initialCode);

  useEffect(() => {
    setLobbyOn(!room);
  }, [room, setLobbyOn, status]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(id);
  }, [error, setError]);

  const errKey = error ? (`race.err.${error}` as DictKey) : null;

  return (
    <div className="flex flex-1 flex-col">
      {status === "connecting" && !room ? <p className="mt-4 text-center text-sm text-sub">{t("race.connecting")}</p> : null}
      {room ? (
        <>
          <RoomScreen room={room} send={send} status={status} smoother={smoother} />
          {room.state === "finished" && !user ? <p className="text-center text-xs text-sub">{t("race.guestSave")}</p> : null}
        </>
      ) : (
        <Lobby rooms={lobby.rooms} online={lobby.online} me={me} send={send} signedIn={!!user} />
      )}
      {errKey ? (
        <div role="alert" className="fade-in fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-error px-4 py-2.5 text-sm text-bg shadow-lg">
          {safeT(t, errKey)}
        </div>
      ) : null}
    </div>
  );
}

function safeT(t: (k: DictKey) => string, key: DictKey): string {
  const s = t(key);
  return s === key ? t("race.err.generic") : s;
}
