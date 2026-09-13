"use client";

import { useRouter } from "next/navigation";
import { CopilotChat, type ChatMessageView } from "@/components/ai/copilot-chat";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CompanyContextSelect({ companies, value, disabled }: { companies: { id: string; name: string }[]; value: string | null; disabled?: boolean }) {
  const router = useRouter();
  return (
    <Select value={value ?? "none"} onValueChange={(v) => router.push(v === "none" ? "/ai" : `/ai?company=${v}`)} disabled={disabled}>
      <SelectTrigger size="sm" className="w-64" aria-label="Azienda di contesto">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Tutto lo studio (nessuna azienda)</SelectItem>
        {companies.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CopilotWorkspace(props: {
  companyId: string | null;
  companyName: string | null;
  aiConfigured: boolean;
  aiReason: string | null;
  conversationId: string | null;
  messages: ChatMessageView[];
  initialQuestion?: string;
}) {
  const router = useRouter();
  return (
    <CopilotChat
      companyId={props.companyId}
      companyName={props.companyName}
      aiConfigured={props.aiConfigured}
      aiReason={props.aiReason}
      initialConversationId={props.conversationId}
      initialMessages={props.messages}
      initialQuestion={props.initialQuestion}
      onConversationCreated={() => router.refresh()}
      className="h-full"
    />
  );
}
