import { NextResponse } from "next/server";
import { ingestCompanyData } from "@/lib/ingest-manager";

export const runtime = "nodejs";

function isAuthorized(req: Request) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) return false;

  const headerKey =
    req.headers.get("x-ingest-api-key") ??
    req.headers.get("x-api-key") ??
    "";

  return headerKey === expected;
}

declare global {
  // eslint-disable-next-line no-var
  var __ingestInProgress: boolean | undefined;
}

function getIngestFlag() {
  if (globalThis.__ingestInProgress === undefined) {
    globalThis.__ingestInProgress = false;
  }
  return globalThis.__ingestInProgress;
}

function setIngestFlag(value: boolean) {
  globalThis.__ingestInProgress = value;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        {
          error:
            "Unauthorized. Set header `x-ingest-api-key` (or `x-api-key`) to match INGEST_API_KEY.",
        },
        { status: 401 }
      );
    }

    if (getIngestFlag()) {
      return NextResponse.json(
        { error: "Ingest already in progress." },
        { status: 409 }
      );
    }

    setIngestFlag(true);
    const startedAt = Date.now();
    const result = await ingestCompanyData();

    return NextResponse.json({
      ...result,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  } finally {
    setIngestFlag(false);
  }
}

