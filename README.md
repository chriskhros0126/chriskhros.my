# chriskhros.my — Personal Tools & Binary Distribution Hub

A modern, production-grade personal tooling hub and binary distribution platform engineered exclusively for the **Cloudflare Ecosystem (Pages + R2 Free Tier)**.

![Architecture: Cloudflare Pages + R2 S3 Presigned Direct Streaming](https://img.shields.io/badge/Architecture-Cloudflare%20Pages%20%2B%20R2-orange?style=flat-square)
![Free Tier Compliant](https://img.shields.io/badge/Ecosystem-100%25%20Free%20Tier%20Compliant-emerald?style=flat-square)
![Large Uploads](https://img.shields.io/badge/Uploads-Direct%20Presigned%20S3%20Streaming-cyan?style=flat-square)
![Aesthetic](https://img.shields.io/badge/Theme-Dark%20Developer%20Minimal-indigo?style=flat-square)

---

## 1. Architectural Highlights

### ⚡ Direct Browser-to-R2 S3 Presigned Uploads (Zero Worker Proxy Limits)
Cloudflare Workers on the free tier enforce a **100 MB HTTP request body limit**. Standard proxy-based file upload endpoints fail when uploading desktop binaries, ISOs, or large zip archives (100 MB – 250 MB+).

This project solves that architectural bottleneck by generating S3-compatible presigned `PUT` URLs on the edge via `@aws-sdk/s3-request-presigner` and `@aws-sdk/client-s3`:
1. **Admin Authentication**: The operator provides the `ADMIN_SECRET_KEY` in the `/admin` portal.
2. **Presigned URL Request**: The frontend calls Cloudflare Pages Functions `/api/sign-upload` with file metadata.
3. **Direct Streaming**: The browser streams the binary directly to Cloudflare R2's S3 API (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com/<bucket>/...`) via `XMLHttpRequest`, reporting accurate real-time progress, bandwidth speed, and ETA.
4. **Metadata Catalog Persistence**: The release entry is automatically registered into `metadata/tools-index.json` in R2.

### 🌐 Zero-Cost Egress & CDN Integration
Cloudflare R2 features **zero egress bandwidth fees**. You can attach a custom subdomain such as `dl.chriskhros.my` directly to your R2 bucket, serving 250 MB+ downloads globally at edge speed without bandwidth cost.

### 🔒 Client-Side Cryptographic Verification
Includes **DevForge** (`/tools/demo-tool`), a 100% client-side WebCrypto workbench that hashes local binaries (SHA-256 / SHA-512) directly in the browser to verify release checksums before execution.

---

## 2. Directory Structure

```text
chriskhros.my/
├── functions/
│   └── api/
│       ├── sign-upload.ts    # Validates admin token, generates direct R2 S3 presigned PUT URL
│       └── tools.ts          # Reads/writes tools-index.json in R2 with seed fallback
├── src/
│   ├── components/
│   │   ├── ToolCard.astro    # Card displaying platform (Win/Mac/Linux/Web), size, version, & download
│   │   └── SearchFilter.astro# Category filter (All, Binaries, Web Apps) + instant search bar
│   ├── data/
│   │   └── tools.json        # Curated seed tools & binary catalog
│   ├── layouts/
│   │   └── Layout.astro      # Dark-mode developer layout (JetBrains Mono & Inter)
│   └── pages/
│       ├── index.astro       # Public showcase & distribution directory
│       ├── admin.astro       # Secure drag-and-drop upload console with progress bar
│       └── tools/
│           └── demo-tool/
│               └── index.astro # DevForge: In-browser binary checksum verifier & crypto tools
├── astro.config.mjs          # Static output with Tailwind integration
├── tailwind.config.mjs       # Custom slate/zinc developer color palette
├── wrangler.toml             # Cloudflare Pages & R2 bindings configuration
└── package.json
```

---

## 3. Cloudflare Setup & Configuration Guide

### Step 3.1: Create your Cloudflare R2 Bucket
1. Open the [Cloudflare Dashboard](https://dash.cloudflare.com/) and navigate to **R2**.
2. Click **Create bucket**.
3. Name your bucket: `chriskhros-binaries`.
4. Leave location hint as **Automatic** (or specify your preferred region).

### Step 3.2: Generate R2 S3 API Credentials
To allow `/api/sign-upload` to sign presigned `PUT` URLs:
1. In Cloudflare Dashboard, go to **R2** > **Manage R2 API Tokens**.
2. Click **Create API token**.
3. Set Permissions: **Object Read & Write**.
4. Select your bucket: `chriskhros-binaries` (or all buckets).
5. Set TTL as needed.
6. Click **Create API Token**.
7. Securely note down:
   - **Account ID** (from R2 overview or URL)
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

### Step 3.3: Configure R2 CORS (Crucial for Direct Browser Uploads)
Because the browser uploads directly from `chriskhros.my` to Cloudflare R2's S3 endpoint, CORS must allow `PUT` requests:
1. Go to **R2** > Click on `chriskhros-binaries` > **Settings**.
2. Scroll down to **CORS Policy** and click **Add CORS rule**.
3. Paste the following JSON policy:
```json
[
  {
    "AllowedOrigins": [
      "https://chriskhros.my",
      "https://*.pages.dev",
      "http://localhost:4321",
      "http://localhost:8788"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Authorization",
      "x-amz-*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### Step 3.4: Configure Custom Domain for Downloads (Optional but Recommended)
1. In your bucket settings, under **Public Access**, click **Connect Domain**.
2. Enter `dl.chriskhros.my`.
3. Cloudflare will automatically configure DNS records and SSL for edge delivery.

---

## 4. Environment Variables & Secrets

Configure these environment variables in your Cloudflare Pages project settings (**Settings > Environment variables**) or in `.env` for local testing:

| Variable | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `ADMIN_SECRET_KEY` | Secret | Secret passphrase protecting `/admin` uploads and catalog mutations | `khros_sec_9f86d081...` |
| `R2_ACCOUNT_ID` | Secret | Cloudflare Account ID | `a1b2c3d4e5f6...` |
| `R2_ACCESS_KEY_ID` | Secret | Cloudflare R2 S3 API Access Key ID | `5e884898da28...` |
| `R2_SECRET_ACCESS_KEY`| Secret | Cloudflare R2 S3 API Secret Key | `4b227777d4dd...` |
| `R2_BUCKET_NAME` | Plaintext | Cloudflare R2 bucket name | `chriskhros-binaries` |
| `R2_PUBLIC_URL` | Plaintext | Public base URL for binary downloads | `https://dl.chriskhros.my` |

> **Setting Secrets via Wrangler CLI:**
> ```bash
> npx wrangler pages secret put ADMIN_SECRET_KEY
> npx wrangler pages secret put R2_ACCOUNT_ID
> npx wrangler pages secret put R2_ACCESS_KEY_ID
> npx wrangler pages secret put R2_SECRET_ACCESS_KEY
> ```

---

## 5. Local Development Workflow

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Astro Static Frontend Development Server
```bash
npm run dev
# Opens at http://localhost:4321
```

### 3. Run with Cloudflare Pages Functions & R2 Emulation
To test the full upload pipeline with local Functions execution:
```bash
npm run build
npx wrangler pages dev dist --compatibility-flag=nodejs_compat
# Runs at http://localhost:8788 with active /api/* endpoints
```

---

## 6. Deployment to Cloudflare Pages

### Option A: Automatic Git Deployments (Recommended)
1. Push your repository to GitHub / GitLab.
2. In Cloudflare Dashboard, go to **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select your repository `chriskhros.my`.
4. Configure Build settings:
   - **Framework preset**: `Astro`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Compatibility flags**: `nodejs_compat`
5. Under **Environment variables**, add the secrets specified in Section 4.
6. Deploy!

### Option B: Deploy via Wrangler CLI
```bash
npm run build
npx wrangler pages deploy dist --project-name=chriskhros-my
```

---

## 7. Using the Admin Portal (`/admin`)

1. Visit `https://chriskhros.my/admin`.
2. Enter your `ADMIN_SECRET_KEY` in Step 1 and click **Remember Key**.
3. Drag-and-drop any binary (.exe, .dmg, .zip, etc., up to 250MB+).
4. Click **Auto-Compute SHA-256** to generate an immutable integrity hash.
5. Fill in the release metadata (Platform, Version, Category, Description, Tags).
6. Click **Generate Presigned Signature & Upload to R2**.
7. Watch real-time streaming progress directly into R2. Once complete, your new binary is live on the public directory!
