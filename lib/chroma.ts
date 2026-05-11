// import "server-only";

import { Document } from "@langchain/core/documents";
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Where } from "chromadb";

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

async function getVectorStore(params?: {
  chromaUrl?: string;
  collectionName?: string;
}) {
  const embeddings = getEmbeddings();
  return new Chroma(embeddings, {
    url: getChromaUrl(params?.chromaUrl),
    collectionName: getCollectionName(params?.collectionName),
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
  
  // Lọc bỏ các đoạn văn bản trống để tránh lỗi "empty array at index 0"
  const validDocs = docs.filter(doc => doc.pageContent.trim().length > 0);

  if (validDocs.length === 0) {
    return { addedIds: [], chunks: 0 };
  }

  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName: options.collectionName,
  });
 
  const addedIds = await vectorStore.addDocuments(validDocs as Document[], {
    ids: options.ids,
  });

  return { addedIds, chunks: docs.length };
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

