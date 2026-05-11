// import "server-only";

import { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChromaClient, type Where } from "chromadb";

export type IngestDataOptions = {
  /**
   * Defaults to `process.env.CHROMA_COLLECTION` or "chatbot".
   */
  collectionName?: string;
  /**
   * Defaults to `process.env.CHROMA_URL` or "http://localhost:8000".
   */
  chromaUrl?: string;
  /**
   * Defaults to 1000.
   */
  chunkSize?: number;
  /**
   * Defaults to 200.
   */
  chunkOverlap?: number;
  /**
   * Per-document metadata attached to all chunks.
   */
  metadata?: Record<string, unknown>;
  /**
   * Optional ids for the chunks (must match chunk count if provided).
   */
  ids?: string[];
};

export type QueryVectorStoreOptions = {
  /**
   * Defaults to `process.env.CHROMA_COLLECTION` or "chatbot".
   */
  collectionName?: string;
  /**
   * Defaults to `process.env.CHROMA_URL` or "http://localhost:8000".
   */
  chromaUrl?: string;
  /**
   * Defaults to 4.
   */
  k?: number;
  /**
   * Optional Chroma filter (metadata-based).
   */
  filter?: Where;
};

function getEmbeddings() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY (or GOOGLE_API_KEY) for Gemini embeddings."
    );
  }

  // Khởi tạo model embedding mới nhất khả dụng trong tài khoản (gemini-embedding-2)
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    modelName: "gemini-embedding-2",
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
}

function getChromaUrl(override?: string) {
  return override ?? process.env.CHROMA_URL ?? "http://localhost:8000";
}

function getCollectionName(override?: string) {
  return override ?? process.env.CHROMA_COLLECTION ?? "chatbot";
}

function normalizeChromaEndpoint(rawUrl: string) {
  // Accept:
  // - http(s)://host:port[/...]
  // - host:port
  // - host
  const asUrl = (() => {
    try {
      return new URL(rawUrl);
    } catch {
      // If scheme missing, assume http.
      return new URL(`http://${rawUrl}`);
    }
  })();

  // Important: DO NOT pass /api/v1 here. chromadb client builds the API path itself.
  const host = asUrl.hostname;
  const port =
    asUrl.port?.trim() !== ""
      ? Number.parseInt(asUrl.port, 10)
      : asUrl.protocol === "https:"
        ? 443
        : 80;

  if (!Number.isFinite(port)) {
    throw new Error(`Invalid CHROMA_URL port: ${asUrl.port}`);
  }

  // SSL rules:
  // - If explicitly https:, ssl=true
  // - If hostname is .internal or localhost, prefer ssl=false
  // - Otherwise infer from protocol
  const isInternal =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".internal");

  const ssl = asUrl.protocol === "https:" ? true : isInternal ? false : false;

  return { host, port, ssl };
}

let _client: ChromaClient | null = null;
let _clientKey: string | null = null;

async function getChromaClient(rawUrl: string) {
  if (_client) return _client;

  const client = new ChromaClient({ 
    path: rawUrl.replace(/\/$/, "") 
  });

  _client = client;
  return client;
}

async function getVectorStore(params?: {
  chromaUrl?: string;
  collectionName?: string;
}) {
  const embeddings = getEmbeddings(); //
  const chromaUrl = getChromaUrl(params?.chromaUrl); //
  const client = await getChromaClient(chromaUrl); //
  const collectionName = getCollectionName(params?.collectionName); //

  return new Chroma(embeddings, {
    index: client, // Quan trọng: Truyền client đã khởi tạo vào đây
    collectionName: collectionName,
  });
}

/**
 * Ingest raw text into ChromaDB:
 * - Split into chunks via LangChain's RecursiveCharacterTextSplitter
 * - Create Gemini embeddings
 * - Store chunks in a Chroma collection
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

  // 1. Khởi tạo client và embedding thủ công
  const chromaUrl = getChromaUrl(options.chromaUrl);
  const client = await getChromaClient(chromaUrl);
  const embeddingsModel = getEmbeddings();
  const collectionName = getCollectionName(options.collectionName);

  // 2. Lấy hoặc Tạo collection trực tiếp từ client (Bỏ qua LangChain ensureCollection)
  const collection = await client.getOrCreateCollection({ name: collectionName });

  // 3. Tạo vector embeddings
  const rawTexts = validDocs.map(d => d.pageContent);
  const vectors = await embeddingsModel.embedDocuments(rawTexts);
  
  // 4. Đẩy trực tiếp vào Chroma
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
 * Query ChromaDB for relevant context chunks.
 */
export async function queryVectorStore(
  query: string,
  options: QueryVectorStoreOptions = {}
) {
  if (!query?.trim()) {
    return {
      context: "",
      matches: [] as Array<{ doc: Document; score: number }>,
    };
  }

  const k = options.k ?? 4;
  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName: options.collectionName,
  });

  const results = await vectorStore.similaritySearchWithScore(
    query,
    k,
    options.filter
  );

  const matches = results.map(([doc, score]) => ({ doc, score }));
  const context = matches.map((m) => m.doc.pageContent).join("\n\n---\n\n");
  return { context, matches };
}

