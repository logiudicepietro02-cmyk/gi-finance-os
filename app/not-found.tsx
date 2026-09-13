import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Pagina non trovata</h1>
      <p className="max-w-sm text-sm text-muted-foreground">La risorsa non esiste oppure non appartiene alla tua organizzazione.</p>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">
        Torna alla dashboard
      </Link>
    </div>
  );
}
