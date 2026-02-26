import Sidebar from "@/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex">{children}</main>
    </div>
  );
}
