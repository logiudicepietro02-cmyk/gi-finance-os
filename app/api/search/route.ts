import { apiRoute, queryParams } from "@/lib/api/handler";
import { globalSearch } from "@/services/search";

export const GET = apiRoute(async (req, ctx) => globalSearch(ctx, queryParams(req).get("q") ?? ""));
