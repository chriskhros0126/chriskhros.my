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
  code?: string;
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

// Built-in seed tools fallback (empty by default)
const SEED_TOOLS: ToolItem[] = [];

// Helper: validate admin secret key with clear diagnostic errors
function validateAdminAuth(request: Request, env: Env): { authorized: boolean; errorResponse?: Response } {
  const authHeader = (
    request.headers.get("x-admin-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();

  const configuredSecret = (env.ADMIN_SECRET_KEY || "").trim();

  if (!configuredSecret) {
    return {
      authorized: false,
      errorResponse: new Response(
        JSON.stringify({
          error: "Cloudflare Configuration Error: ADMIN_SECRET_KEY is not defined in Cloudflare Pages environment variables. Please add ADMIN_SECRET_KEY in Cloudflare Pages (Settings -> Environment variables) and trigger a redeploy.",
          code: "MISSING_ENV_SECRET",
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      ),
    };
  }

  if (!authHeader) {
    return {
      authorized: false,
      errorResponse: new Response(
        JSON.stringify({
          error: "Unauthorized: No Admin Secret Key provided. Please enter your secret key in Step 1.",
          code: "NO_SECRET_PROVIDED",
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      ),
    };
  }

  if (authHeader !== configuredSecret) {
    return {
      authorized: false,
      errorResponse: new Response(
        JSON.stringify({
          error: "Unauthorized: The entered key does not match the ADMIN_SECRET_KEY configured in Cloudflare Pages. Please check for typos or copy-paste whitespace.",
          code: "INVALID_SECRET",
        }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      ),
    };
  }

  return { authorized: true };
}

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
          return stored;
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
          return stored;
        }
      }
    } catch {
      // Index object does not exist yet
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

  throw new Error("Neither R2_BUCKET binding nor R2 S3 credentials are configured for storage persistence.");
}

export const onRequestOptions = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

// GET: Fetch catalog or test authorization
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  // Endpoint to test token validity from frontend
  if (url.searchParams.get("verify") === "true") {
    const auth = validateAdminAuth(request, env);
    if (!auth.authorized) {
      return auth.errorResponse!;
    }
    return new Response(
      JSON.stringify({ success: true, message: "Admin Secret Key verified successfully." }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  try {
    const tools = await loadToolsFromStorage(env);
    return new Response(JSON.stringify(tools), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache, no-store, must-revalidate",
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

  const auth = validateAdminAuth(request, env);
  if (!auth.authorized) {
    return auth.errorResponse!;
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
    route: body.route || (body.type === "web" || body.category === "Web Apps" ? `/tools/app?id=${generatedId}` : undefined),
    code: body.code,
    size: body.size || (body.sizeBytes ? `${(body.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : (body.type === "web" || body.category === "Web Apps" ? "Web App" : "N/A")),
    sizeBytes: body.sizeBytes,
    sha256: body.sha256,
    releaseDate: body.releaseDate || new Date().toISOString().split("T")[0],
    featured: body.featured ?? false,
    tags: Array.isArray(body.tags) ? body.tags : ["Binary", body.platform],
  };

  try {
    const currentTools = await loadToolsFromStorage(env);
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

  const auth = validateAdminAuth(request, env);
  if (!auth.authorized) {
    return auth.errorResponse!;
  }

  const url = new URL(request.url);
  const toolId = url.searchParams.get("id");
  const clearAll = url.searchParams.get("all") === "true" || toolId === "all";

  if (!toolId && !clearAll) {
    return new Response(JSON.stringify({ error: "Missing 'id' query parameter (or ?all=true)." }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    let updated: ToolItem[] = [];
    if (!clearAll) {
      const currentTools = await loadToolsFromStorage(env);
      updated = currentTools.filter(t => t.id !== toolId);
    }
    await saveToolsToStorage(env, updated);

    return new Response(JSON.stringify({ 
      success: true, 
      removedId: toolId || "all",
      remainingCount: updated.length 
    }), {
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
