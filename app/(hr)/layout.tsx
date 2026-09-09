import Sidebar from "@/components/hr/Sidebar";
import TopBar from "@/components/hr/TopBar";
import CommandKProvider from "@/components/hr/CommandK";
import { requireHrSession } from "@/lib/server/auth";

export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const session = await requireHrSession();
  return (
    <CommandKProvider>
      <Sidebar
        organizationName={session.organizationName}
        userEmail={session.email}
        userRole={session.role}
      />
      <div className="lg:pl-[232px]">
        <TopBar />
        <main className="min-h-[calc(100vh-52px)]">{children}</main>
      </div>
    </CommandKProvider>
  );
}
