import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BasisBadge } from "@/components/app/badges";
import type { BasisKey } from "@/lib/labels";

const BASIS_TAG = /\[(DATO|CALCOLO|INTERPRETAZIONE|IPOTESI)\]/g;

/** Blocks dangerous URL schemes (javascript:, data:, ...) in AI/document-sourced markdown links. */
function safeHref(href: string | undefined): string | undefined {
  if (!href) return href;
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(href)) return href;
  return undefined;
}

/** Safe markdown (no raw HTML). [DATO]/[CALCOLO]/[INTERPRETAZIONE]/[IPOTESI] tags render as badges. */
export function Markdown({ children }: { children: string }) {
  const source = children.replace(BASIS_TAG, (_m, tag: string) => `\`§${tag}\``);
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-3 text-[15px] font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-3 text-[14px] font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 marker:text-muted-foreground/60">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ children, href }) => (
            <a href={safeHref(href)} className="text-primary underline-offset-2 hover:underline" rel="noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b px-2 py-1 text-left font-medium text-muted-foreground">{children}</th>,
          td: ({ children }) => <td className="num border-b px-2 py-1">{children}</td>,
          code: ({ children }) => {
            const text = String(children);
            if (text.startsWith("§")) return <BasisBadge basis={text.slice(1) as BasisKey} />;
            return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[12px]">{children}</code>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
