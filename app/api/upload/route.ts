import { NextRequest, NextResponse } from "next/server";
import { ingestData } from "@/lib/chroma";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Đọc nội dung file (Hỗ trợ file .txt, .md, .json, vv.)
    const text = await file.text();

    // Sử dụng hàm ingestData đã được tối ưu trong lib/chroma.ts
    const result = await ingestData(text, {
      metadata: { source: file.name },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Đã nạp thành công ${result.chunks} chunks từ file ${file.name} vào ChromaDB!` 
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
