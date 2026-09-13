import { AppSidebar } from "@/components/app/app-sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { Topbar } from "@/components/app/topbar";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const ai = getAIStatus();
  return (
    <div className="flex h-dvh overflow-hidden bg-background print:h-auto print:overflow-visible">
      <AppSidebar organizationName={user.organizationName} />
      <div className="flex min-w-0 flex-1 flex-col print:overflow-visible">
        <Topbar user={{ name: user.name, email: user.email, role: user.role, organizationName: user.organizationName }} ai={ai} />
        <main className="scrollbar-thin flex-1 overflow-y-auto print:h-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-[1480px] px-6 py-6">{children}</div>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
