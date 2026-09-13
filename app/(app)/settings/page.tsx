import type { Metadata } from "next";
import { Pill } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Panel } from "@/components/app/panel";
import { RecalculateAlertsButton, ThresholdsForm, UsersManager } from "@/components/settings/settings-forms";
import { getAIStatus } from "@/lib/ai";
import { requireUser } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { contextFromUser } from "@/services/context";
import { getOrganizationSettings } from "@/services/settings";
import { listUsers } from "@/services/users";

export const metadata: Metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const user = await requireUser();
  const ctx = contextFromUser(user);
  const [{ organization, settings }, users] = await Promise.all([getOrganizationSettings(ctx), listUsers(ctx)]);
  const ai = getAIStatus();

  return (
    <>
      <PageHeader title="Impostazioni" description={`${organization.name} · il tuo ruolo: ${ROLE_LABELS[user.role]}`} />
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Soglie alert" description="Regole deterministiche applicate a tutte le aziende" action={can(user.role, "alert:manage") && <RecalculateAlertsButton />}>
          <ThresholdsForm settings={settings} canEdit={can(user.role, "settings:manage")} />
        </Panel>

        <Panel title="Provider AI" id="ai" description="Configurato tramite variabili d'ambiente (nessun segreto nel database)">
          <dl className="space-y-2 p-4 text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stato</dt>
              <dd>{ai.configured ? <Pill tone={ai.isTestProvider ? "warning" : "success"}>{ai.isTestProvider ? "Provider di test" : "Attivo"}</Pill> : <Pill tone="neutral">Non configurato</Pill>}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Provider</dt>
              <dd className="font-mono text-xs">{ai.provider ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Modello</dt>
              <dd className="font-mono text-xs">{ai.model ?? "—"}</dd>
            </div>
            {ai.reason && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{ai.reason}</p>}
            <div className="border-t pt-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Governance AI</p>
              <ul className="ml-4 list-disc space-y-0.5">
                <li>Autonoma: classificazione, estrazione, sintesi, analisi, suggerimenti.</li>
                <li>Con approvazione: modifica di dati finanziari verificati, task ad alta priorità.</li>
                <li>Mai: comunicazioni esterne o invii automatici.</li>
                <li>I calcoli finanziari e gli alert sono deterministici.</li>
              </ul>
              <p className="mt-2">
                Imposta <code className="rounded bg-muted px-1">AI_PROVIDER</code> e <code className="rounded bg-muted px-1">ANTHROPIC_API_KEY</code> (o <code className="rounded bg-muted px-1">OPENAI_API_KEY</code>) nel file <code className="rounded bg-muted px-1">.env</code>.
              </p>
            </div>
          </dl>
        </Panel>

        <Panel title="Utenti e ruoli" className="xl:col-span-2" description="Owner: tutto · Advisor: clienti, operazioni, approvazioni · Analyst: documenti, task, copilot">
          <UsersManager users={users} canManage={can(user.role, "users:manage")} currentUserId={user.id} />
        </Panel>
      </div>
    </>
  );
}
