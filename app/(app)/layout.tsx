import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // safe-area-top: pushes content below Dynamic Island / notch on iOS PWA
    <div className="flex h-full overflow-hidden bg-gray-50 safe-area-top">
      <Sidebar />
      {/*
       * flex-col: ensures page components fill 100% width (cross-axis stretch)
       *   instead of sizing to content in the default row direction.
       * min-h-0: allows the flex item to shrink below its content's natural height.
       * main-pb: bottom padding = nav height + safe-area-inset-bottom (mobile only).
       */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col main-pb">{children}</main>
      <BottomNav />
    </div>
  );
}
