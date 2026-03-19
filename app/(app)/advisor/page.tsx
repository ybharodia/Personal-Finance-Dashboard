export const dynamic = "force-dynamic";

export default function AdvisorPage() {
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
        <p className="text-stone-400 text-sm">Your advisor chat will appear here.</p>
      </div>
    </div>
  );
}
