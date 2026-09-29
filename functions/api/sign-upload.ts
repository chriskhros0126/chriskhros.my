import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface Env {
  ADMIN_SECRET_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_URL?: string;
  R2_BUCKET?: any; // Cloudflare R2Bucket binding
}

interface SignUploadPayload {
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  platform?: string;
  category?: string;
  version?: string;
}

// CORS headers helper
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
};

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // 1. Authenticate Request via Admin Secret
  const authHeader = request.headers.get("x-admin-token") || 
                     request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!env.ADMIN_SECRET_KEY) {
    return new Response(
      JSON.stringify({
        error: "Server configuration error: ADMIN_SECRET_KEY is not defined in Cloudflare Pages environment variables.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  if (!authHeader || authHeader !== env.ADMIN_SECRET_KEY) {
    return new Response(
      JSON.stringify({ error: "Unauthorized: Invalid or missing admin secret token." }),
      { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 2. Validate R2 / S3 Configuration
  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucketName = env.R2_BUCKET_NAME || "chriskhros-binaries";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return new Response(
      JSON.stringify({
        error: "R2 S3 API credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not configured.",
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // 3. Parse and Validate Payload
  let payload: SignUploadPayload;
  try {
    payload = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON request body." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  if (!payload.filename || typeof payload.filename !== "string") {
    return new Response(
      JSON.stringify({ error: "Missing or invalid 'filename' field." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }

  // Sanitize filename to avoid path traversal / invalid S3 characters
  const rawFilename = payload.filename.trim();
  const safeFilename = rawFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const platformFolder = payload.platform ? payload.platform.toLowerCase().replace(/[^a-z0-9]/g, "") : "general";
  const timestamp = Date.now();
  const fileKey = `binaries/${platformFolder}/${timestamp}-${safeFilename}`;

  const contentType = payload.contentType || "application/octet-stream";

  try {
    // 4. Initialize S3 Client targeting Cloudflare R2
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // 5. Generate Presigned PUT URL for direct browser-to-R2 upload
    // Expiration: 1 hour (3600 seconds) gives plenty of time for 250MB+ uploads on standard connections
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: contentType,
      Metadata: {
        "uploaded-by": "chriskhros-admin",
        "original-filename": safeFilename,
        "platform": payload.platform || "all",
        "version": payload.version || "latest",
      },
    });

    const uploadUrl = await getSignedUrl(s3, putCommand, { expiresIn: 3600 });

    // 6. Compute Public Download URL
    // Can be R2 public bucket URL (e.g., https://dl.chriskhros.my/<fileKey> or https://pub-xxx.r2.dev/<fileKey>)
    const publicBaseUrl = (env.R2_PUBLIC_URL || "").replace(/\/$/, "");
    const downloadUrl = publicBaseUrl 
      ? `${publicBaseUrl}/${fileKey}` 
      : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${fileKey}`;

    return new Response(
      JSON.stringify({
        success: true,
        uploadUrl,
        fileKey,
        downloadUrl,
        expiresInSeconds: 3600,
        filename: safeFilename,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: "Failed to generate presigned upload URL.",
        details: err?.message || String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};
