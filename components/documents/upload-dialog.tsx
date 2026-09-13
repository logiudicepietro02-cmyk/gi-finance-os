"use client";

import { FileUp, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, errorText } from "@/lib/client/api";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/documents/types";
import { cn } from "@/lib/utils";

export function UploadDialog({
  companies,
  defaultCompanyId,
  checklistItemId,
  defaultType,
  defaultOpen = false,
  triggerLabel = "Carica documento",
  triggerVariant = "default",
  triggerSize = "sm",
}: {
  companies: { id: string; name: string }[];
  defaultCompanyId?: string;
  checklistItemId?: string;
  defaultType?: string;
  defaultOpen?: boolean;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  triggerSize?: "sm" | "xs";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId ?? "none");
  const [type, setType] = useState(defaultType ?? "AUTO");
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setError("Sono supportati solo file PDF.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function upload(process: boolean) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (companyId !== "none") form.set("companyId", companyId);
      if (type !== "AUTO") form.set("type", type);
      if (checklistItemId) form.set("checklistItemId", checklistItemId);
      const res = await api<{ document: { id: string }; duplicateOf: { fileName: string } | null }>("/api/documents", { formData: form });
      if (res.duplicateOf) toast.warning(`File identico già presente: ${res.duplicateOf.fileName}`);
      toast.success("Documento caricato");
      setOpen(false);
      setFile(null);
      router.push(`/documents/${res.document.id}${process ? "?process=1" : ""}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={triggerSize} variant={triggerVariant} data-testid="open-upload">
          <Upload /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Carica documento</DialogTitle>
          <DialogDescription>PDF di bilanci, visure, documenti bancari, finanziamenti, business plan. L&apos;analisi estrae testo, classifica ed estrae i dati.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-8 text-center transition",
              dragging ? "border-primary bg-primary/5" : "hover:border-primary/40",
            )}
          >
            <FileUp className="size-6 text-muted-foreground" />
            {file ? (
              <>
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Trascina qui il PDF o clicca per selezionarlo</span>
                <span className="text-xs text-muted-foreground">Solo PDF</span>
              </>
            )}
          </button>
          <Input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => pick(e.target.files)} data-testid="upload-input" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Azienda</Label>
              <Select value={companyId} onValueChange={setCompanyId} disabled={Boolean(checklistItemId)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Rileva da P.IVA</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo documento</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">Classificazione automatica</SelectItem>
                  {DOCUMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" disabled={!file || pending} onClick={() => upload(false)}>
            Solo caricamento
          </Button>
          <Button type="button" disabled={!file || pending} onClick={() => upload(true)} data-testid="upload-and-process">
            {pending && <Loader2 className="animate-spin" />} Carica e analizza
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
