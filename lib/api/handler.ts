import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { HttpError, badRequest } from "@/lib/errors";
import { ForbiddenError, NotFoundError } from "@/lib/permissions";
import { contextFromUser, type ServiceContext } from "@/services/context";

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Dati non validi.", issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (error instanceof ForbiddenError || error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  console.error("[api] unhandled error", error);
  return NextResponse.json({ error: "Errore interno. Riprova o contatta l'amministratore." }, { status: 500 });
}

type RouteContext<P> = { params: Promise<P> };

/**
 * Wraps a Route Handler: authenticates, builds the tenant-scoped ServiceContext,
 * serializes the result and maps domain errors to HTTP status codes.
 */
export function apiRoute<P = Record<string, string>>(
  handler: (req: Request, ctx: ServiceContext, params: P) => Promise<unknown>,
) {
  return async (req: Request, route: RouteContext<P>) => {
    try {
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: "Non autenticato." }, { status: 401 });
      const params = route?.params ? await route.params : ({} as P);
      const result = await handler(req, contextFromUser(user), params);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Corpo della richiesta non valido (JSON atteso).");
  }
  return schema.parse(body);
}

export function queryParams(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}
