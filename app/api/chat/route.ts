import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { queryVectorStore } from "@/lib/chroma";

export const runtime = "nodejs";

type ChatRequest = {
  question: string;
  stream?: boolean;
  k?: number;
};

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY (or GOOGLE_API_KEY).");
  }
  return apiKey;
}

function buildPrompt(params: { question: string; context: string }) {
  const { question, context } = params;

  return [
    "Bạn là một trợ lý AI chuyên nghiệp cho chatbot RAG.",
    "",
    "Nhiệm vụ:",
    "- Trả lời đúng trọng tâm, rõ ràng, có cấu trúc.",
    "- Ưu tiên dùng thông tin trong CONTEXT. Nếu CONTEXT không đủ, nói rõ bạn không có đủ dữ liệu và đề xuất câu hỏi/nguồn bổ sung.",
    "- Không bịa đặt. Không suy đoán khi thiếu dữ kiện.",
    "",
    "CONTEXT (trích từ vector store):",
    context?.trim() ? context : "(Không có context phù hợp.)",
    "",
    "USER QUESTION:",
    question,
    "",
    "Trả lời bằng tiếng Việt, chuyên nghiệp, ngắn gọn nhưng đầy đủ ý.",
  ].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<ChatRequest>;
    const question = body.question?.trim();
    const stream = body.stream ?? true;
    const k = body.k ?? 4;

    if (!question) {
      return NextResponse.json(
        { error: "Missing `question` in request body." },
        { status: 400 }
      );
    }

    const { context, matches } = await queryVectorStore(question, { k });
    const prompt = buildPrompt({ question, context });

    const genAI = new GoogleGenerativeAI(getApiKey());
    const modelName = process.env.GEMINI_CHAT_MODEL ?? "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    if (!stream) {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      return NextResponse.json({
        answer: text,
        context,
        sources: matches.map((m) => m.doc.metadata),
      });
    }

    const encoder = new TextEncoder();
    const streamResult = await model.generateContentStream(prompt);

    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (err) {
          controller.error(err);
          return;
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

