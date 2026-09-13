import { apiRoute } from "@/lib/api/handler";
import { getDocumentFile } from "@/services/documents";

export const GET = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const file = await getDocumentFile(ctx, id);
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(file.bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
