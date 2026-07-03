import { FinaWidget } from "@/components/fina-widget";
import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="max-w-[1120px] flex-1 px-10 pt-8 pb-16 max-md:px-5 max-md:pt-6">{children}</main>
      <FinaWidget />
    </div>
  );
}
