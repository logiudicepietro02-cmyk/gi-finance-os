"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { CopilotChat } from "@/components/ai/copilot-chat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function CopilotSheet({ companyId, companyName, aiConfigured, aiReason, defaultOpen = false }: { companyId: string; companyName: string; aiConfigured: boolean; aiReason: string | null; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" data-testid="open-copilot">
          <Sparkles /> Chiedi al Copilot
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="size-4 text-violet-600" /> AI Copilot
          </SheetTitle>
          <SheetDescription className="text-xs">Contesto: {companyName}</SheetDescription>
        </SheetHeader>
        <CopilotChat companyId={companyId} companyName={companyName} aiConfigured={aiConfigured} aiReason={aiReason} className="flex-1" />
      </SheetContent>
    </Sheet>
  );
}
