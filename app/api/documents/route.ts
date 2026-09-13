import { apiRoute, queryParams } from "@/lib/api/handler";
import { bool, int, str } from "@/lib/api/params";
import { badRequest } from "@/lib/errors";
import { listDocuments, uploadDocument } from "@/services/documents";

export const GET = apiRoute(async (req, ctx) => {
  const q = queryParams(req);
  return listDocuments(ctx, {
    companyId: str(q.get("companyId")) ?? undefined,
    type: str(q.get("type")) ?? undefined,
    status: str(q.get("status")) ?? undefined,
    q: str(q.get("q")) ?? undefined,
    review: bool(q.get("review")),
  });
});

/** multipart/form-data: file, companyId?, type?, fiscalYear?, description?, checklistItemId? */
export const POST = apiRoute(async (req, ctx) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Richiesta non valida: invia il file come multipart/form-data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("Seleziona un file PDF da caricare.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return uploadDocument(ctx, {
    fileName: file.name,
    bytes,
    companyId: str(form.get("companyId")),
    type: str(form.get("type")),
    fiscalYear: int(form.get("fiscalYear")),
    description: str(form.get("description")),
    checklistItemId: str(form.get("checklistItemId")),
  });
});
