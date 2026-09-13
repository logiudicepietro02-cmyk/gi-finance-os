import { apiRoute } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/permissions";
import { authorize } from "@/services/context";

/** Lightweight polling endpoint for the processing progress UI. */
export const GET = apiRoute<{ id: string }>(async (_req, ctx, { id }) => {
  authorize(ctx, "document:read");
  const doc = await db.document.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, status: true, processingLog: true, errorMessage: true, updatedAt: true },
  });
  if (!doc) throw new NotFoundError("Documento");
  return doc;
});
