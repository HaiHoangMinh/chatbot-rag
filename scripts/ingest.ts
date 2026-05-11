import * as dotenv from "dotenv";

// Load .env khi chạy local
dotenv.config();

type IngestApiResponse =
  | { success: true; count: number; durationMs?: number }
  | { success: false; error: unknown; durationMs?: number };

async function main() {
  console.log("--- BẮT ĐẦU NẠP DỮ LIỆU CÔNG TY ---");

  const baseUrl = process.env.INGEST_BASE_URL ?? "http://localhost:3000";
  const apiKey = process.env.INGEST_API_KEY;

  if (!apiKey) {
    throw new Error("Missing INGEST_API_KEY in environment.");
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingest`, {
    method: "POST",
    headers: {
      "x-ingest-api-key": apiKey,
    },
  });

  const json = (await res.json()) as IngestApiResponse;
  if (!res.ok) {
    throw new Error(
      `Ingest API failed: HTTP ${res.status} ${res.statusText} :: ${JSON.stringify(
        json
      )}`
    );
  }

  if (json.success) {
    console.log(`--- HOÀN THÀNH: Đã nạp ${json.count} files ---`);
    if (typeof json.durationMs === "number") {
      console.log(`--- Thời gian: ${json.durationMs}ms ---`);
    }
    return;
  }

  throw new Error(`Ingest failed: ${JSON.stringify(json)}`);
}

main().catch(console.error); 