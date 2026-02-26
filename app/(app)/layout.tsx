import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex pb-16 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
