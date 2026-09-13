import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { addContact } from "@/services/companies";

export const POST = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return addContact(ctx, id, body);
});
