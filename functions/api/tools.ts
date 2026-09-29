import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

export interface ToolItem {
  id: string;
  title: string;
  description: string;
  category: "Binaries" | "Web Apps" | "Dev Tools" | "Utilities";
  platform: "Windows" | "macOS" | "Linux" | "Web" | "Cross-Platform";
  version: string;
  type: "binary" | "web";
  downloadUrl?: string;
  filename?: string;
  fileKey?: string;
  route?: string;
  size?: string;
  sizeBytes?: number;
  sha256?: string;
  releaseDate: string;
  featured?: boolean;
  tags?: string[];
}

export interface Env {
  ADMIN_SECRET_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
  R2_BUCKET?: any; // Cloudflare Pages R2 bucket binding
}

const INDEX_KEY = "metadata/tools-index.json";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
};

// Built-in seed tools fallback
const SEED_TOOLS: ToolItem[] = [
  {
    id: "devforge-web",
    title: "DevForge Crypto & Binary Inspector",
    description: "Zero-latency, client-side cryptographic hashing, Base64/Hex encoding, and JWT inspector with streaming large file checksum verification.",
    category: "Web Apps",
    platform: "Web",
    version: "v1.4.0",
    type: "web",
    route: "/tools/demo-tool",
    size: "Browser Native",
    sizeBytes: 0,
    releaseDate: "2026-09-20",
    featured: true,
    tags: ["Crypto", "SHA-256", "Base64", "JWT", "Offline-First"]
  },
  {
    id: "neural-packet-analyzer-win",
    title: "PacketForge Pro (Windows x64)",
    description: "High-throughput PCAP network traffic inspect engine with GPU-accelerated TLS packet reconstruction and real-time flow tracing.",
    category: "Binaries",
    platform: "Windows",
    version: "v2.8.4",
    type: "binary",
    downloadUrl: "https://dl.chriskhros.my/binaries/windows/packetforge-v2.8.4-win-x64.exe",
    filename: "packetforge-v2.8.4-win-x64.exe",
    size: "184.2 MB",
    sizeBytes: 193146880,
    sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
    releaseDate: "2026-09-15",
    featured: true,
    tags: ["Network", "PCAP", "Security", "Direct R2"]
  },
  {
    id: "neural-packet-analyzer-mac",
    title: "PacketForge Pro (macOS Apple Silicon)",
    description: "Native Universal Apple Silicon (M1/M2/M3/M4) binary for low-level packet capture, Berkeley Packet Filter support, and live network graphs.",
    category: "Binaries",
    platform: "macOS",
    version: "v2.8.4",
    type: "binary",
    downloadUrl: "https://dl.chriskhros.my/binaries/macos/packetforge-v2.8.4-darwin-arm64.dmg",
    filename: "packetforge-v2.8.4-darwin-arm64.dmg",
    size: "142.8 MB",
    sizeBytes: 149736448,
    sha256: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
    releaseDate: "2026-09-15",
    featured: true,
    tags: ["macOS", "Apple Silicon", "Direct R2", "DMG"]
  },
  {
    id: "r2-syncer-cli",
    title: "KhrosSync S3/R2 Pipeline Utility",
    description: "Multi-threaded delta synchronizer and deduplicating archive utility specifically tuned for Cloudflare R2 bucket streaming and backup verification.",
    category: "Binaries",
    platform: "Linux",
    version: "v3.1.2",
    type: "binary",
    downloadUrl: "https://dl.chriskhros.my/binaries/linux/khrossync-v3.1.2-linux-amd64.tar.gz",
    filename: "khrossync-v3.1.2-linux-amd64.tar.gz",
    size: "118.5 MB",
    sizeBytes: 124256256,
    sha256: "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
    releaseDate: "2026-08-30",
    featured: false,
    tags: ["CLI", "Cloudflare R2", "Backup", "Linux AMD64"]
  },
  {
    id: "core-memory-dump-win",
    title: "HexTrace Memory Profiler (Win x64)",
    description: "Standalone memory heap visualizer and process memory diff inspection tool for native Windows binaries and game engine processes.",
    category: "Binaries",
    platform: "Windows",
    version: "v1.9.0",
    type: "binary",
    downloadUrl: "https://dl.chriskhros.my/binaries/windows/hextrace-v1.9.0-setup.exe",
    filename: "hextrace-v1.9.0-setup.exe",
    size: "215.3 MB",
    sizeBytes: 225758412,
    sha256: "ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d",
    releaseDate: "2026-08-12",
    featured: false,
    tags: ["Profiler", "Reverse Eng", "Win64", "Direct R2"]
  },
  {
    id: "asset-forge-universal",
    title: "VectorMesh 3D Engine Previewer",
    description: "Universal portable bundle for real-time WebGPU shader rendering and 3D glTF/USDZ binary model validation across platforms.",
    category: "Binaries",
    platform: "Cross-Platform",
    version: "v0.9.5",
    type: "binary",
    downloadUrl: "https://dl.chriskhros.my/binaries/universal/vectormesh-v0.9.5-portable.zip",
    filename: "vectormesh-v0.9.5-portable.zip",
    size: "248.9 MB",
    sizeBytes: 260990566,
    sha256: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
    releaseDate: "2026-07-28",
    featured: false,
    tags: ["WebGPU", "3D", "Portable ZIP", "250MB Direct"]
  }
];

// Helper: load tools index from R2 or fallback
async function loadToolsFromStorage(env: Env): Promise<ToolItem[]> {
  // Option A: Direct Cloudflare R2 bucket binding
  if (env.R2_BUCKET && typeof env.R2_BUCKET.get === "function") {
    try {
      const obj = await env.R2_BUCKET.get(INDEX_KEY);
      if (obj) {
        const text = await obj.text();
        const stored: ToolItem[] = JSON.parse(text);
        if (Array.isArray(stored)) {
          // Merge stored tools with seed tools to guarantee comprehensive catalog
          const storedIds = new Set(stored.map(t => t.id));
          const remainingSeeds = SEED_TOOLS.filter(s => !storedIds.has(s.id));
          return [...stored, ...remainingSeeds];
        }
      }
    } catch (err) {
      console.error("Error reading index from R2 binding:", err);
    }
  }

  // Option B: S3 API fallback if credentials exist
  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    try {
      const s3 = new S3Client({
        region: "auto",
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });

      const res = await s3.send(new GetObjectCommand({
        Bucket: env.R2_BUCKET_NAME || "chriskhros-binaries",
        Key: INDEX_KEY,
      }));

      if (res.Body) {
        const text = await res.Body.transformToString();
        const stored: ToolItem[] = JSON.parse(text);
        if (Array.isArray(stored)) {
          const storedIds = new Set(stored.map(t => t.id));
          const remainingSeeds = SEED_TOOLS.filter(s => !storedIds.has(s.id));
          return [...stored, ...remainingSeeds];
        }
      }
    } catch {
      // Index object might not exist yet, fallback to seed tools
    }
  }

  return SEED_TOOLS;
}

// Helper: save tools index to R2
async function saveToolsToStorage(env: Env, tools: ToolItem[]): Promise<void> {
  const jsonContent = JSON.stringify(tools, null, 2);

  if (env.R2_BUCKET && typeof env.R2_BUCKET.put === "function") {
    await env.R2_BUCKET.put(INDEX_KEY, jsonContent, {
      httpMetadata: { contentType: "application/json" },
    });
    return;
  }

  if (env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });

    await s3.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME || "chriskhros-binaries",
      Key: INDEX_KEY,
      ContentType: "application/json",
      Body: jsonContent,
    }));
    return;
  }

  throw new Error("Neither R2_BUCKET binding nor R2 S3 credentials are configured for persistent write.");
}

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// GET: Fetch list of all tools & downloadable binaries
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;
  try {
    const tools = await loadToolsFromStorage(env);
    return new Response(JSON.stringify(tools), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
        ...corsHeaders,
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to load tools" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

// POST: Add new binary / tool to the catalog (Admin only)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authHeader = request.headers.get("x-admin-token") ||
                     request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!env.ADMIN_SECRET_KEY || authHeader !== env.ADMIN_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid admin secret." }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  let body: Partial<ToolItem>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  if (!body.title || !body.platform || !body.category) {
    return new Response(JSON.stringify({ error: "Missing required fields: title, platform, category." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const generatedId = (body.id || body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + body.platform.toLowerCase()).replace(/-+/g, "-");

  const newTool: ToolItem = {
    id: generatedId,
    title: body.title,
    description: body.description || "",
    category: body.category as any,
    platform: body.platform as any,
    version: body.version || "v1.0.0",
    type: body.type || (body.downloadUrl ? "binary" : "web"),
    downloadUrl: body.downloadUrl,
    filename: body.filename,
    fileKey: body.fileKey,
    route: body.route,
    size: body.size || (body.sizeBytes ? `${(body.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : "N/A"),
    sizeBytes: body.sizeBytes,
    sha256: body.sha256,
    releaseDate: body.releaseDate || new Date().toISOString().split("T")[0],
    featured: body.featured ?? false,
    tags: Array.isArray(body.tags) ? body.tags : ["Binary", body.platform],
  };

  try {
    const currentTools = await loadToolsFromStorage(env);
    // Replace if exists, else prepend
    const existingIndex = currentTools.findIndex(t => t.id === newTool.id);
    if (existingIndex >= 0) {
      currentTools[existingIndex] = newTool;
    } else {
      currentTools.unshift(newTool);
    }

    await saveToolsToStorage(env, currentTools);

    return new Response(JSON.stringify({ success: true, tool: newTool }), {
      status: 201,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to persist tool to catalog." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

// DELETE: Remove tool from catalog (Admin only)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const authHeader = request.headers.get("x-admin-token") ||
                     request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!env.ADMIN_SECRET_KEY || authHeader !== env.ADMIN_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized: Invalid admin secret." }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const url = new URL(request.url);
  const toolId = url.searchParams.get("id");

  if (!toolId) {
    return new Response(JSON.stringify({ error: "Missing 'id' query parameter." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const currentTools = await loadToolsFromStorage(env);
    const updated = currentTools.filter(t => t.id !== toolId);
    await saveToolsToStorage(env, updated);

    return new Response(JSON.stringify({ success: true, removedId: toolId }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Failed to remove tool." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};
