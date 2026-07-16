"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { colorForUsername } from "@/lib/colors";

type PresenceUser = {
  id: string;
  username: string;
  color: string;
};

type Props = {
  documentId: string;
  user: { id: string; username: string };
};

export function PresenceAvatars({ documentId, user }: Props) {
  const [peers, setPeers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | null =
      null;

    try {
      const supabase = getBrowserSupabase();
      const self: PresenceUser = {
        id: user.id,
        username: user.username,
        color: colorForUsername(user.username),
      };

      channel = supabase.channel(`presence:doc:${documentId}`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (cancelled || !channel) return;
          const state = channel.presenceState();
          const next: PresenceUser[] = [];
          for (const key of Object.keys(state)) {
            const metas = state[key] as unknown as PresenceUser[];
            const first = metas?.[0];
            if (first?.id && first?.username) next.push(first);
          }
          setPeers(next);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel?.track(self);
          }
        });
    } catch {
      setPeers([
        {
          id: user.id,
          username: user.username,
          color: colorForUsername(user.username),
        },
      ]);
    }

    return () => {
      cancelled = true;
      if (channel) {
        void getBrowserSupabase().removeChannel(channel);
      }
    };
  }, [documentId, user.id, user.username]);

  return (
    <div className="flex items-center gap-1" title="People in this document">
      {peers.map((p) => (
        <span
          key={p.id}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-white"
          style={{ backgroundColor: p.color }}
          title={p.username}
        >
          {p.username.slice(0, 2).toUpperCase()}
        </span>
      ))}
    </div>
  );
}
