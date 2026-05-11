// lib/chroma.ts
import { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient, type Where } from "chromadb";

export type IngestDataOptions = {
  collectionName?: string;
  chromaUrl?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  metadata?: Record<string, unknown>;
  ids?: string[];
};

export type QueryVectorStoreOptions = {
  collectionName?: string;
  chromaUrl?: string;
  k?: number;
  filter?: Where;
};

function getEmbeddings() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY for embeddings.");
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    modelName: "gemini-embedding-2",
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
}

function getChromaUrl(override?: string) {
  // Ưu tiên link nội bộ Railway để tránh Timeout 10s
  return override ?? process.env.CHROMA_URL ?? "http://chroma.railway.internal:8000";
}

function getCollectionName(override?: string) {
  return override ?? process.env.CHROMA_COLLECTION ?? "chatbot";
}

let _client: ChromaClient | null = null;

/**
 * Khởi tạo Client siêu tối giản để tránh lỗi Timeout
 */
async function getChromaClient(rawUrl: string) {
  if (_client) return _client;

  const cleanUrl = rawUrl.replace(/\/+$/, ""); 
  
  // Chỉ khởi tạo instance, không gọi heartbeat ở đây để tránh treo 10s
  _client = new ChromaClient({ 
    path: cleanUrl 
  });

  return _client;
}

/**
 * HÀM MỚI: Kiểm tra kết nối trực tiếp từ Chatbot sang Chroma
 */
export async function testChromaConnection() {
  try {
    const url = getChromaUrl();
    const client = await getChromaClient(url);
    // Gọi lệnh version để xác nhận server phản hồi
    const version = await client.version(); 
    return { success: true, version, url };
  } catch (error: any) {
    return { success: false, error: error.message, url: getChromaUrl() };
  }
}

async function getVectorStore(params?: {
  chromaUrl?: string;
  collectionName?: string;
}) {
  const embeddings = getEmbeddings();
  const chromaUrl = getChromaUrl(params?.chromaUrl);
  const client = await getChromaClient(chromaUrl);
  const collectionName = getCollectionName(params?.collectionName);

  return new Chroma(embeddings, {
    index: client,
    collectionName: collectionName,
  });
}

export async function ingestData(text: string, options: IngestDataOptions = {}) {
  if (!text?.trim()) return { addedIds: [], chunks: 0 };

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize ?? 1000,
    chunkOverlap: options.chunkOverlap ?? 200,
  });

  const docs = await splitter.createDocuments([text], [options.metadata ?? {}]);
  const validDocs = docs.filter(doc => doc.pageContent.trim().length > 0);
  
  if (validDocs.length === 0) return { addedIds: [], chunks: 0 };

  const chromaUrl = getChromaUrl(options.chromaUrl);
  const client = await getChromaClient(chromaUrl);
  const collectionName = getCollectionName(options.collectionName);

  // Ép tạo collection để đảm bảo DB đã sẵn sàng
  const collection = await client.getOrCreateCollection({ name: collectionName });

  const embeddingsModel = getEmbeddings();
  const rawTexts = validDocs.map(d => d.pageContent);
  const vectors = await embeddingsModel.embedDocuments(rawTexts);
  
  const ids = validDocs.map((_, i) => options.ids?.[i] ?? crypto.randomUUID());
  
  await collection.add({
    ids: ids,
    embeddings: vectors,
    metadatas: validDocs.map(d => d.metadata),
    documents: rawTexts
  });

  return { addedIds: ids, chunks: validDocs.length };
}

export async function queryVectorStore(
  query: string,
  options: QueryVectorStoreOptions = {}
) {
  if (!query?.trim()) return { context: "", matches: [] };

  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName: options.collectionName,
  });

  const results = await vectorStore.similaritySearchWithScore(query, options.k ?? 4, options.filter);
  const matches = results.map(([doc, score]) => ({ doc, score }));
  const context = matches.map((m) => m.doc.pageContent).join("\n\n---\n\n");
  return { context, matches };
}