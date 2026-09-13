import { z } from "zod";
import { apiRoute, parseBody } from "@/lib/api/handler";
import { createUser, listUsers } from "@/services/users";

export const GET = apiRoute(async (_req, ctx) => listUsers(ctx));

export const POST = apiRoute(async (req, ctx) => {
  const body = await parseBody(req, z.record(z.string(), z.unknown()));
  return createUser(ctx, body);
});
