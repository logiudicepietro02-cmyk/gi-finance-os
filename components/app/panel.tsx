import Link from "next/link";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn("rounded-xl border-0 bg-card shadow-[var(--shadow-soft-sm)]", className)}>
      {(title || action) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b px-4 py-2">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[13px] font-semibold">{title}</h2>}
            {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success" | "hero";
  href?: string;
}) {
  const body = (
    <div
      className={cn(
        "relative flex h-full flex-col justify-between gap-1 overflow-hidden rounded-xl border-0 bg-card px-4 py-3.5 shadow-[var(--shadow-soft-sm)] transition-shadow",
        href && "hover:shadow-[var(--shadow-soft)]",
      )}
    >
      {tone === "hero" && <span className="absolute inset-x-0 top-0 h-[3px] rounded-t-xl bg-primary" />}
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "num text-2xl font-semibold tracking-tight",
          tone === "danger" && "text-red-600",
          tone === "warning" && "text-amber-600",
          tone === "success" && "text-emerald-600",
          tone === "hero" && "text-primary",
        )}
      >
        {value}
      </span>
      {hint && <span className="truncate text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}
