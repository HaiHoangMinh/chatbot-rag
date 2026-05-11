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
  const apiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY or GOOGLE_API_KEY"
    );
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    modelName:
      process.env.GEMINI_EMBEDDING_MODEL ??
      "gemini-embedding-2",
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
}

function getChromaUrl(override?: string) {
  return (
    override ??
    process.env.CHROMA_URL ??
    "http://localhost:8001"
  );
}

function getCollectionName(override?: string) {
  return (
    override ??
    process.env.CHROMA_COLLECTION ??
    "chatbot"
  );
}

let _client: ChromaClient | null = null;
let _clientKey: string | null = null;

async function getChromaClient(rawUrl: string) {
  if (_client && _clientKey === rawUrl) {
    return _client;
  }

  const client = new ChromaClient({
    path: rawUrl,
    tenant: "default_tenant",
    database: "default_database",
  });

  await client.heartbeat();

  _client = client;
  _clientKey = rawUrl;

  return client;
}

export async function testChromaConnection() {
  const rawUrl = getChromaUrl();

  try {
    const client = await getChromaClient(rawUrl);

    const version = await client.version();

    const collections =
      await client.listCollections();

    return {
      success: true as const,
      url: rawUrl,
      version,
      collections,
    };
  } catch (err) {
    const error =
      err instanceof Error
        ? {
            name: err.name,
            message: err.message,
            stack: err.stack,
          }
        : {
            message: String(err),
          };

    return {
      success: false as const,
      url: rawUrl,
      error,
    };
  }
}

async function getVectorStore(params?: {
  chromaUrl?: string;
  collectionName?: string;
}) {
  const embeddings = getEmbeddings();

  const chromaUrl = getChromaUrl(
    params?.chromaUrl
  );

  const client = await getChromaClient(
    chromaUrl
  );

  return new Chroma(embeddings, {
    index: client,
    collectionName: getCollectionName(
      params?.collectionName
    ),
  });
}

export async function ingestData(
  text: string,
  options: IngestDataOptions = {}
) {
  if (!text?.trim()) {
    return {
      addedIds: [] as string[],
      chunks: 0,
    };
  }

  const splitter =
    new RecursiveCharacterTextSplitter({
      chunkSize: options.chunkSize ?? 1000,
      chunkOverlap:
        options.chunkOverlap ?? 200,
    });

  const docs = await splitter.createDocuments(
    [text],
    [options.metadata ?? {}]
  );

  const validDocs = docs.filter(
    (doc) =>
      doc.pageContent.trim().length > 0
  );

  if (validDocs.length === 0) {
    return {
      addedIds: [],
      chunks: 0,
    };
  }

  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName:
      options.collectionName,
  });

  const addedIds =
    await vectorStore.addDocuments(
      validDocs as Document[],
      {
        ids: options.ids,
      }
    );

  return {
    addedIds,
    chunks: validDocs.length,
  };
}

export async function queryVectorStore(
  query: string,
  options: QueryVectorStoreOptions = {}
) {
  if (!query?.trim()) {
    return {
      context: "",
      matches: [] as Array<{
        doc: Document;
        score: number;
      }>,
    };
  }

  const k = options.k ?? 4;

  const vectorStore = await getVectorStore({
    chromaUrl: options.chromaUrl,
    collectionName:
      options.collectionName,
  });

  const results =
    await vectorStore.similaritySearchWithScore(
      query,
      k,
      options.filter
    );

  const matches = results.map(
    ([doc, score]) => ({
      doc,
      score,
    })
  );

  const context = matches
    .map((m) => m.doc.pageContent)
    .join("\n\n---\n\n");

  return {
    context,
    matches,
  };
}