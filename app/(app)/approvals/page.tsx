import type { Metadata } from "next";
import Link from "next/link";
import { ApprovalsList } from "@/components/approvals/approvals-list";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { listApprovals } from "@/services/approvals";
import { contextFromUser } from "@/services/context";

export const metadata: Metadata = { title: "Approvazioni" };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = sp.status === "APPROVED" || sp.status === "REJECTED" ? sp.status : "PENDING";
  const approvals = await listApprovals(contextFromUser(user), { status });
  return (
    <>
      <PageHeader title="Approvazioni" description="Azioni proposte dall'AI o dal sistema che richiedono una decisione umana" />
      <div className="mb-3 flex gap-1">
        {[
          { key: "PENDING", label: "In attesa" },
          { key: "APPROVED", label: "Approvate" },
          { key: "REJECTED", label: "Rifiutate" },
        ].map((s) => (
          <Link key={s.key} href={`/approvals?status=${s.key}`} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", status === s.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
            {s.label}
          </Link>
        ))}
      </div>
      <Panel>
        <ApprovalsList approvals={approvals} canDecide={can(user.role, "approval:decide")} />
      </Panel>
    </>
  );
}
