"use client";

import { useEffect, useState } from "react";
import type { AdvisorBriefing, AdvisorMessage } from "@/lib/advisor";

const OPENING_PROMPT: AdvisorMessage = {
  role: "user",
  content:
    "Please review my financial data and open with your single most important insight or observation. Be specific — reference actual numbers, categories, or trends from my data. Keep it to 2–3 sentences. Don't greet me or introduce yourself. Lead with the insight.",
};

export default function AdvisorClient({ briefing }: { briefing: AdvisorBriefing }) {
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchOpening() {
      try {
        const res = await fetch("/api/advisor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: [OPENING_PROMPT], briefing }),
          signal: controller.signal,
        });

        if (!res.ok) throw new Error("Non-OK response");

        const { reply } = await res.json();
        setMessages([{ role: "assistant", content: reply }]);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchOpening();
    return () => controller.abort();
  // briefing is a stable server-passed prop; intentionally omitted from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 h-full bg-stone-50 overflow-hidden">
      {/* Left sidebar — Snapshot */}
      <div className="w-1/4 shrink-0 border-r border-stone-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">Snapshot</p>
        <p className="text-stone-400 text-sm">Your financial snapshot will appear here.</p>
      </div>

      {/* Right panel — Chat */}
      <div className="flex-1 flex flex-col p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-500 mb-4">Chat</p>

        {loading && (
          <p className="text-stone-400 text-sm font-normal text-center mt-10">
            Reviewing your finances…
          </p>
        )}

        {error && (
          <p className="text-stone-400 text-sm text-center mt-10">
            Couldn&apos;t load your financial summary. Try refreshing.
          </p>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-widest text-stone-500">
                Your Advisor
              </span>
            </div>
            <p className="text-stone-800 text-sm leading-relaxed">{messages[0].content}</p>
          </div>
        )}
      </div>
    </div>
  );
}
