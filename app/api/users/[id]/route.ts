import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { updateUser } from "@/services/users";

export const PATCH = apiRoute<{ id: string }>(async (req, ctx, { id }) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return updateUser(ctx, id, body);
});
