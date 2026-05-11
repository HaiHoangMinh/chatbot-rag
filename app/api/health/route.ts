import { NextResponse } from "next/server";
import { testChromaConnection } from "@/lib/chroma";

export const runtime = "nodejs";

type HealthOk = {
  ok: true;
  geminiApiKeyPresent: boolean;
  chroma: {
    ok: true;
    url: string;
    version: unknown;
  };
  timestamp: string;
};

type HealthFail = {
  ok: false;
  geminiApiKeyPresent: boolean;
  chroma: {
    ok: boolean;
    url?: string;
    version?: unknown;
    error?: unknown;
  };
  errors: string[];
  timestamp: string;
};

function hasGeminiKey() {
  // Align with the rest of the codebase (chat + embeddings)
  return Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY);
}

export async function GET() {
  const timestamp = new Date().toISOString();

  const geminiApiKeyPresent = hasGeminiKey();
  const chromaResult = await testChromaConnection();

  const errors: string[] = [];
  if (!geminiApiKeyPresent) errors.push("Missing GEMINI_API_KEY (or GOOGLE_API_KEY).");
  if (!chromaResult.success) errors.push("Chroma connection failed.");

  if (errors.length > 0) {
    const payload: HealthFail = {
      ok: false,
      geminiApiKeyPresent,
      chroma: chromaResult.success
        ? { ok: true, url: chromaResult.url, version: chromaResult.version }
        : { ok: false, url: chromaResult.url, error: chromaResult.error },
      errors,
      timestamp,
    };
    return NextResponse.json(payload, { status: 500 });
  }

  const payload: HealthOk = {
    ok: true,
    geminiApiKeyPresent,
    chroma: { ok: true, url: chromaResult.url, version: chromaResult.version },
    timestamp,
  };
  return NextResponse.json(payload, { status: 200 });
}

