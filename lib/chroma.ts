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

/**
 * Khởi tạo Embeddings sử dụng Gemini
 */
function getEmbeddings() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY for embeddings.");
  }
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    modelName: "gemini-embedding-2", // Khớp với cấu hình Variable của bạn
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
}

function getChromaUrl(override?: string) {
  return override ?? process.env.CHROMA_URL ?? "http://localhost:8000";
}

function getCollectionName(override?: string) {
  return override ?? process.env.CHROMA_COLLECTION ?? "chatbot";
}

let _client: ChromaClient | null = null;

/**
 * Khởi tạo Client Chroma tối giản cho Railway nội bộ
 */
async function getChromaClient(rawUrl: string) {
  if (_client) return _client;

  const cleanUrl = rawUrl.replace(/\/$/, ""); 
  
  // Sử dụng path trực tiếp là cách an toàn nhất để kết nối nội bộ .internal
  const client = new ChromaClient({ 
    path: cleanUrl 
  });

  _client = client;
  return client;
}

/**
 * Lấy instance VectorStore cho LangChain
 */
async function getVectorStore(params?: {
  chromaUrl?: string;
  collectionName?: string;
}) {
  const embeddings = getEmbeddings();
  const chromaUrl = getChromaUrl(params?.chromaUrl);
  const client = await getChromaClient(chromaUrl);
  const collectionName = getCollectionName(params?.collectionName);

  return new Chroma(embeddings, {
    index: client, // Truyền client đã config path nội bộ vào đây
    collectionName: collectionName,
  });
}

/**
 * Nạp dữ liệu vào ChromaDB bằng Native SDK (Bỏ qua lỗi LangChain ensureCollection)
 */
export async function ingestData(text: string, options: IngestDataOptions = {}) {
  if (!text?.trim()) return { addedIds: [] as string[], chunks: 0 };

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize ?? 1000,
    chunkOverlap: options.chunkOverlap ?? 200,
  });

  const docs = await splitter.createDocuments([text], [options.metadata ?? {}]);
  const validDocs = docs.filter(doc => doc.pageContent.trim().length > 0);
  
  if (validDocs.length === 0) return { addedIds: [], chunks: 0 };

  const chromaUrl = getChromaUrl(options.chromaUrl);
  const client = await getChromaClient(chromaUrl);
  const embeddingsModel = getEmbeddings();
  const collectionName = getCollectionName(options.collectionName);

  // Ép tạo collection trực tiếp để tránh lỗi 404
  const collection = await client.getOrCreateCollection({ name: collectionName });

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

/**
 * Truy vấn dữ liệu từ ChromaDB
 */
export async function queryVectorStore(
  query: string,
  options: QueryVectorStoreOptions = {}
) {
  if (!query?.trim()) return { context: "", matches: [] };

  const k = options.k ?? 4;
  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName: options.collectionName,
  });

  const results = await vectorStore.similaritySearchWithScore(query, k, options.filter);

  const matches = results.map(([doc, score]) => ({ doc, score }));
  const context = matches.map((m) => m.doc.pageContent).join("\n\n---\n\n");
  return { context, matches };
}