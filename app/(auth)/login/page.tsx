import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accesso" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");
  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">GI</div>
          <span className="text-sm font-semibold tracking-[0.18em] text-white">GI FINANCE OS</span>
        </div>
        <div className="max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight text-white">Il copilota operativo del consulente finanziario.</h1>
          <p className="text-[15px] leading-relaxed text-sidebar-foreground/80">
            Ogni mattina sai dove il tuo giudizio professionale crea più valore: bilanci letti in automatico, indicatori calcolati con formula,
            operazioni e documenti sotto controllo, briefing pronti per l&apos;incontro.
          </p>
          <ul className="space-y-2 text-sm text-sidebar-foreground/75">
            <li>· Numeri calcolati dal sistema, mai inventati</li>
            <li>· Ogni dato collegato al documento sorgente</li>
            <li>· L&apos;AI suggerisce, il consulente decide</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">G.I. Finance · consulenza finanziaria e aziendale indipendente per PMI</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full bg-sidebar-primary/10 blur-3xl" />
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-12">
        <LoginForm next={next} showDemoAccounts={process.env.NODE_ENV !== "production"} />
      </main>
    </div>
  );
}
