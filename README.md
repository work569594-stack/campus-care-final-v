# CampusCare | MITS Gwalior

<p align="center">
  <img src="public/assets/aistudio/newsite-logo1_e4e82ecd.png" alt="Madhav Institute of Technology & Science, Gwalior Logo" width="96" />
</p>

**CampusCare** is a full-stack campus issue reporting, 2D/3D spatial exploration, and real-time maintenance tracking web application built for **Madhav Institute of Technology & Science (MITS), Gwalior**.

Instead of paper registers or unorganized messages, students can pinpoint an exact classroom, lab, workshop, or washroom on an interactive floor plan or 3D campus model, attach compressed photos, receive a trackable ticket ID (`CC-2048`), and follow repairs live—while campus estates staff manage dispatch, technician workloads, and building heatmaps in real time.

---

## Table of Contents

1. [How the App Works (High-Level Architecture)](#how-the-app-works-high-level-architecture)
2. [In-Depth Guide to Every Tool & Library Used](#in-depth-guide-to-every-tool--library-used)
3. [Key Features & How They Work Under the Hood](#key-features--how-they-work-under-the-hood)
4. [Database Architecture (SQLite + WAL Mode)](#database-architecture-sqlite--wal-mode)
5. [Project Structure](#project-structure)
6. [Complete API Reference](#complete-api-reference)
7. [Security & Data Protection](#security--data-protection)
8. [Local Setup & Scripts](#local-setup--scripts)

---

## How the App Works (High-Level Architecture)

CampusCare uses a **single-server full-stack architecture**: one Node.js + Express process serves both the REST/SSE backend API and the React frontend (via Vite middleware in development, or compiled static files in production).

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                         BROWSER (React 19 + Vite)                         │
│                                                                           │
│  Pages: Landing │ Report (4-Step) │ Track │ 3D Campus │ Student & Admin   │
│  Visuals: Three.js WebGL2 │ Interactive SVG Floor Plans │ Recharts        │
│  UX: Motion Spring Cursor │ Web Audio Synth │ Canvas Image Compression    │
└───────────────────────────┬───────────────────────────────▲───────────────┘
                            │ HTTPS / Fetch + Zod           │ SSE Stream
                            │ (Cookies + Bearer Token)      │ (/api/events/stream)
┌───────────────────────────▼───────────────────────────────┴───────────────┐
│                      EXPRESS 4 SERVER (server.ts :3000)                   │
│                                                                           │
│  • Auth & RBAC Middleware     • Magic-Byte Image Uploader (/api/uploads)  │
│  • CSRF & Origin Verification • Gemini AI Proxy (/api/chat)               │
└───────────────┬───────────────────────────────────┬───────────────────────┘
                │                                   │
┌───────────────▼───────────────┐   ┌───────────────▼───────────────────────┐
│   SQLite DB (server/db.ts)    │   │   External AI & Local File Storage    │
│   data/campuscare.db (WAL)    │   │   • Google Gemini (@google/genai)     │
│   9 tables + seeded rooms     │   │   • Disk Uploads (data/uploads/*.jpg) │
└───────────────────────────────┘   └───────────────────────────────────────┘
```

---

## In-Depth Guide to Every Tool & Library Used

### 1. Frontend Core & Routing
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **React** (`react`, `react-dom`) | `19.0.1` | Builds the entire interactive user interface with functional components, React hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`), and Context providers (`AuthContext`, `SoundContext`, `ToastContext`). |
| **TypeScript** (`typescript`) | `7.0.2` | Enforces strict compile-time types across frontend components, backend Express routes, SQLite row mappers, and shared domain interfaces (`src/types/campus.ts`). |
| **React Router DOM** (`react-router-dom`) | `7.18.6` | Handles client-side SPA routing (`/`, `/report`, `/track`, `/campus-3d`, `/login`, `/admin/login`, `/admin/*`), URL query deep-links (e.g., `/report?room=FF-CR-105`), and route-level `<ProtectedRoute>` access guards. |

### 2. Styling, Typography & Visual System
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Tailwind CSS v4** (`tailwindcss`, `@tailwindcss/vite`, `autoprefixer`) | `4.3.3` | Utility-first styling loaded via `@import "tailwindcss";` in `src/index.css`, paired with CSS custom properties (`--bg-base: #05070D`, `--accent-cyan`, `--accent-violet`, `--accent-amber`), backdrop-blur glass cards (`.glass-card`), gradient buttons (`.btn-gradient`), and radial aurora/grid backgrounds. |
| **Google Fonts** | Web Fonts | Loaded in `index.html`: **Sora** & **Space Grotesk** (display headings), **Plus Jakarta Sans** (UI body copy), and **JetBrains Mono** (tabular ticket IDs and live counters via `.font-mono-tabular`). |
| **Lucide React** (`lucide-react`) | `0.546.0` | Crisp, consistent vector UI icons across navigation, issue categories, status badges, drawers, and dashboards. |

### 3. Animations, Custom Cursor, Confetti & Sound
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Motion** (`motion` / `motion/react`) | `12.23.24` | Powers smooth route transitions (`AnimatePresence` with blur fade), hero word reveals, toast slide-ins, `MagneticButton` hover attraction (`useSpring`), and the spring-lagged `CustomCursor` ring. Automatically disabled when `prefers-reduced-motion: reduce` is enabled. |
| **Canvas Confetti** (`canvas-confetti`) | `1.9.4` | Fires a celebratory confetti burst on the final confirmation screen when a student successfully submits a campus issue report (`src/pages/ReportPage.tsx`). |
| **Web Audio API** (`src/lib/sound.ts`) | Browser Native | Zero-asset procedural sound synthesizer using `AudioContext`, `OscillatorNode`, `BiquadFilterNode` (low-pass filtering), and `GainNode` envelopes to generate subtle clicks, hovers, step transitions, toggles, error buzzes, and 3-note success chords—persisted via user preference and muteable from the navbar. |

### 4. 2D Floor Plans, 3D Campus & Analytics
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Three.js** (`three`, `@types/three`) | `0.187.0` | Renders the interactive 3D MITS campus (`src/components/Campus3DScene.tsx`) using `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `PMREMGenerator` + `RoomEnvironment` IBL lighting, `ACESFilmicToneMapping`, `PCFSoftShadowMap`, procedural `CanvasTexture` courts/grids, and raycasted building click/hover selection. |
| **Custom Interactive SVG Engine** (`src/components/FloorPlanSVG.tsx`) | Native SVG + React | Renders clickable vector floor plans for Ground Floor + Workshop Block and First Floor + Library / MBA / Outdoor areas using `svgBounds` metadata from `src/lib/campus.ts`, color-coded dynamically by open/urgent ticket heatmaps. |
| **Recharts** (`recharts`) | `3.11.0` | Powers the Staff Maintenance Dashboard analytics (`src/pages/AdminDashboardPage.tsx`) with responsive `AreaChart` (14-day reported vs. resolved trend), `BarChart` (open vs. resolved per building), and `PieChart` (category distribution). |

### 5. Backend, Database, Validation & File Uploads
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Express** (`express`, `@types/express`) | `4.21.2` | Serves the REST API (`/api/*`), authentication routes, binary upload endpoint, Server-Sent Events stream, Gemini AI proxy, and Vite dev middleware or production `dist/` static bundle. |
| **Node.js Built-in SQLite** (`node:sqlite` `DatabaseSync`) | Node 22+ Native | Embedded relational SQL database persisted to `data/campuscare.db` with `PRAGMA journal_mode = WAL` and strict `FOREIGN KEY` constraints (`server/db.ts`). |
| **Zod** (`zod`) | `4.6.7` | Single source of truth for schema validation (`src/lib/validation.ts`) shared identically between browser forms and Express API endpoints (email, enrollment number, ticket format `CC-xxxx`, title/description lengths, photo path rules). |
| **HTML5 Canvas Image Compressor** (`src/lib/validation.ts`) | Browser Native | Client-side `compressIssueImage()` downscales photos over `350 KB` (max `1600px` dimension) and re-encodes to JPEG (`0.82` quality) before uploading binary bytes. |
| **Dotenv** (`dotenv`) | `17.2.3` | Loads server-side environment secrets (`GEMINI_API_KEY`, `APP_URL`, `ADMIN_PASSCODE`) from `.env`. |

### 6. AI Assistant & Optional Cloud Integration
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Google Gen AI SDK** (`@google/genai`) | `3.6.1` | Powers `/api/chat` on the backend (`server.ts`) using server-side `GEMINI_API_KEY`, MITS Gwalior room-directory system instructions, exponential-backoff retry, and automatic failover from `gemini-4-hydrogen` to `gemini-3.1-flash-lite`. |
| **Supabase JS Client** (`@supabase/supabase-js`) | `2.119.2` | Included alongside `supabase/migration_and_seed.sql` and `src/lib/supabase.ts` as an optional external PostgreSQL/Auth reference schema when deploying with external Supabase. |

### 7. Build & Developer Tooling
| Tool | Version | What It Does & Why It Is Used |
| :--- | :--- | :--- |
| **Vite** (`vite`, `@vitejs/plugin-react`) | `8.3.0` | Ultra-fast TypeScript/JSX bundler and dev middleware (`vite.config.ts`) with `@` path aliases and a custom `copy-unbundled-src-assets` build hook. |
| **TSX** (`tsx`) | `4.21.0` | Runs `server.ts` directly in TypeScript without a separate compilation step (`npm run dev`). |

---

## Key Features & How They Work Under the Hood

### 1. Dual Authentication & Iframe-Safe Sessions
- **Student Portal (`/login`)**: Students sign up with their full name, MITS enrollment number (e.g., `0901CS231045`), email, and password (minimum 8 characters), or sign in to submit and track reports.
- **Staff Admin Portal (`/admin/login`)**: Supports two secure onboarding paths:
  1. **First-Run Setup**: If no admin exists and `ADMIN_PASSCODE` is unset, the first staff member can claim the initial admin account via `/api/auth/admin/claim`.
  2. **Staff Passcode / Password Sign-In**: Admins authenticate with email + password or the server-side `ADMIN_PASSCODE`.
- **Dual Cookie + In-Memory Bearer Transport**:
  - Over HTTPS or reverse proxies, the server sets `HttpOnly; SameSite=None; Secure; Partitioned` cookies so sessions work inside embedded iframes.
  - As a resilient fallback when browsers block third-party iframe cookies, `src/lib/api.ts` holds the `sessionToken` strictly in JavaScript memory (never `localStorage` or `sessionStorage`) and attaches `Authorization: Bearer <token>` on API calls.

### 2. 4-Step Idempotent Report Submission (`/report`)
1. **Location**: Search by room name/ID, filter by building/floor, or click a room directly on the 2D SVG floor plan (supports `?room=ROOM_ID` deep links from QR codes, 3D buildings, or the AI chatbot).
2. **Category**: Automatically prioritizes categories relevant to the selected `room.type` (e.g., `Plumbing/Washroom` for toilets, `Equipment` for labs, `Projectors` for smart classes).
3. **Details & Photos**: Live character validation (`title >= 5`, `description >= 10`), urgency selector (`low`, `medium`, `urgent`), and drag/drop or file picker for up to 3 images (`<= 5 MB`, JPEG/PNG/WebP).
4. **Review & Submit**: Sends an `idempotency_key` (`crypto.randomUUID()`) so accidental double-clicks or network retries return the existing ticket instead of creating duplicates.

### 3. Live Ticket Tracking (`/track`) & Real-Time SSE
- Any user can enter a ticket ID (e.g., `CC-2048`) to inspect its 5-stage progress bar (`reported` → `acknowledged` → `assigned` → `in_progress` → `resolved`), assigned technician contact card, and full timestamped audit trail (`issue_events`).
- Signed-in students also see a **My Reports** table below the lookup bar.
- Whenever any ticket is created, assigned, or updated, `server.ts` broadcasts an `issues_changed` Server-Sent Event over `/api/events/stream`, prompting open pages (`LandingPage`, `TrackPage`, `Campus3DPage`, `AdminDashboardPage`) to refresh immediately without manual reloads.

### 4. CampusCare AI Assistant (`src/components/CampusChatbot.tsx`)
- Grounded with MITS Gwalior building codes (`GF-*`, `FF-*`, `WS-*`, `LIB-*`, `MBA-*`, `OUT-*`) and maintenance categories.
- Automatically strips initial UI welcome/error banners so conversation history sent to Gemini always starts with a `user` turn.
- Scans replies with a regex (`/\b(?:GF|FF|WS|LIB|MBA|OUT)-[A-Z0-9-]+\b/`) to render 1-click **"Report issue in `<ROOM_ID>` →"** buttons right inside chat bubbles.

### 5. Adaptive 3D Campus Explorer (`/campus-3d` & Hero Preview)
- Automatically detects software WebGL renderers (`SwiftShader`, `llvmpipe`, `softpipe`) and reduces pixel ratio, shadows, and glass transmission to prevent frame drops on low-end GPUs.
- Includes 5 instant camera presets (*Overview*, *Institute Building*, *Workshop Block*, *Library*, *MBA Block*) with smooth damped interpolation.

---

## Database Architecture (SQLite + WAL Mode)

On first startup, `server/db.ts` initializes `data/campuscare.db`, enables `WAL` mode and foreign-key enforcement, creates 9 indexed tables, and seeds the MITS Gwalior room directory, 5 maintenance technicians, ticket sequence counter (`CC-2048+`), and 80 historical demo tickets (`CC-1968` to `CC-2047`):

| Table | Purpose |
| :--- | :--- |
| `users` | Core user accounts (`id`, `email`, salted `scrypt` `password_hash`, `created_at`). |
| `profiles` | Student/staff metadata (`full_name`, `email`, `enrollment_no`, `phone`). |
| `user_roles` | Role assignments (`student` or `admin`) with composite primary key `(user_id, role)`. |
| `sessions` | Active session records storing `SHA-256` token hashes and 30-day expiry timestamps. |
| `rooms` | Full MITS Gwalior directory (`id`, `name`, `type`, `floor`, `building`, `wing`, `width`, `depth`). |
| `technicians` | Campus maintenance staff (`name`, `specialty`, `phone`, `active`). |
| `counters` | Atomic `ticket_seq` sequence generator (`UPDATE ... RETURNING value`) for `CC-xxxx` IDs. |
| `issues` | Maintenance tickets (`ticket_id`, `room_id`, `category`, `urgency`, `status`, `photo_urls`, `idempotency_key`, `is_demo`, timestamps). |
| `issue_events` | Immutable audit log of every status transition, technician assignment, and staff note. |

---

## Project Structure

```text
├── .env.example                    # Environment variable template
├── index.html                      # SPA entry HTML, metadata, fonts, MITS favicon
├── metadata.json                   # App name & server-side Gemini capability config
├── package.json                    # Dependencies and npm scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite bundler + unbundled asset copy plugin
├── server.ts                       # Express app (Auth, Uploads, Issues, SSE, Gemini Proxy, Vite)
├── server/
│   └── db.ts                       # SQLite schema, scrypt/SHA-256 crypto, seeding & stats queries
├── public/
│   └── assets/aistudio/
│       └── newsite-logo1_e4e82ecd.png  # Official MITS Gwalior crest logo
├── supabase/
│   └── migration_and_seed.sql      # Optional external PostgreSQL/Supabase migration script
└── src/
    ├── App.tsx                     # Router, context providers, page transitions
    ├── main.tsx                    # React 19 root mount
    ├── index.css                   # Tailwind v4, CSS tokens, aurora/grid, cursor & pin animations
    ├── types/
    │   └── campus.ts               # TypeScript models (Room, Issue, IssueEvent, CampusStats, etc.)
    ├── context/
    │   ├── AuthContext.tsx         # User session state, student & admin auth actions
    │   ├── SoundContext.tsx        # Global click/hover audio listener & mute state
    │   └── ToastContext.tsx        # Animated bottom-right toast notification stack
    ├── lib/
    │   ├── api.ts                  # Fetch wrapper, ApiError, X-Requested-With, in-memory Bearer token
    │   ├── campus.ts               # Complete MITS Gwalior rooms & SVG floor-plan coordinates
    │   ├── data.ts                 # Client data accessors & EventSource SSE subscription
    │   ├── sound.ts                # Web Audio API procedural sound engine
    │   ├── supabase.ts             # Optional external Supabase client helper
    │   └── validation.ts           # Shared Zod schemas & client-side Canvas JPEG compressor
    ├── components/
    │   ├── Campus3DScene.tsx       # Three.js interactive 3D campus
    │   ├── CampusChatbot.tsx       # Floating Gemini AI campus assistant
    │   ├── CustomCursor.tsx        # Spring-physics pointer cursor (mouse only)
    │   ├── FloorPlanSVG.tsx        # Clickable 2D SVG floor plans + issue heatmap
    │   ├── Footer.tsx              # Site footer with quick portal links
    │   ├── MagneticButton.tsx      # Spring-reactive CTA button
    │   ├── MitsLogo.tsx            # Official MITS crest image component with fallback
    │   ├── Navbar.tsx              # Sticky top bar, sound toggle, user menu & mobile drawer
    │   ├── ProtectedRoute.tsx      # Auth & staff-role route guard
    │   └── StatusBadge.tsx         # Workflow status & urgency badges
    └── pages/
        ├── LandingPage.tsx         # Hero, live stats, floor plan, 3D preview, categories
        ├── ReportPage.tsx          # 4-step problem reporting wizard
        ├── TrackPage.tsx           # Public ticket lookup, timeline & student report history
        ├── Campus3DPage.tsx        # Full-screen 3D explorer with live open-issue cards
        ├── StudentLoginPage.tsx    # Student Sign In / Sign Up / Password info
        ├── AdminLoginPage.tsx      # Staff Sign In / First-run Admin Claim
        └── AdminDashboardPage.tsx  # Staff overview charts, ticket drawer, heatmap & technicians
```

---

## Complete API Reference

| Method & Endpoint | Access | Description |
| :--- | :--- | :--- |
| `GET /api/auth/me` | Public | Returns `{ user, profile, isAdmin, sessionToken }` for active session |
| `POST /api/auth/register` | Public | Creates a student account with enrollment number and starts session |
| `POST /api/auth/login` | Public | Authenticates email/password and sets session cookie + token |
| `GET /api/auth/admin/status` | Public | Checks whether first-run staff admin setup is still open |
| `POST /api/auth/admin/claim` | First-run only | Registers the initial staff admin account when none exists |
| `POST /api/auth/admin/login` | Staff | Verifies staff credentials or server-side `ADMIN_PASSCODE` |
| `POST /api/auth/forgot-password` | Public | Returns MITS Estates IT support recovery instructions |
| `POST /api/auth/logout` | Public | Deletes session from SQLite and clears session cookie |
| `GET /api/rooms` | Public | Returns all campus rooms merged with SVG floor-plan coordinates |
| `GET /api/stats` | Public | Returns campus KPIs, room counts, building/category stats & 14-day trend |
| `GET /api/issues/ticket/:ticketId` | Public | Looks up `CC-xxxx` ticket, room, technician & event timeline (PII stripped) |
| `GET /api/issues/mine` | Authenticated | Lists reports created by the signed-in user |
| `POST /api/issues` | Authenticated | Validates with Zod, deduplicates via `idempotency_key`, enforces 5/hr rate limit |
| `POST /api/uploads` | Authenticated | Accepts raw JPEG/PNG/WebP (`<= 5 MB`), checks magic bytes, stores UUID image |
| `GET /api/uploads/:filename` | Public | Serves uploaded issue images safely with `nosniff` and cache headers |
| `GET /api/admin/issues` | Admin only | Lists all issues filtered by status, urgency, building, or search text |
| `PATCH /api/admin/issues/:id/status` | Admin only | Updates issue status, sets `resolved_at`, and logs an `issue_events` note |
| `PATCH /api/admin/issues/:id/assign` | Admin only | Assigns/unassigns a technician and auto-advances status to `assigned` |
| `GET /api/technicians` | Admin only | Lists active maintenance technicians |
| `GET /api/events/stream` | Public | SSE endpoint pushing `issues_changed` notifications in real time |
| `POST /api/chat` | Public | Server-side Gemini chat endpoint with MITS system prompt and retry logic |

---

## Security & Data Protection

- **Password & Session Cryptography**: Passwords use per-user 16-byte random salts hashed with `crypto.scryptSync` (64-byte key) and checked with `crypto.timingSafeEqual`. Raw session tokens are never stored in SQLite—only their SHA-256 hashes.
- **Role-Based Access Control**: Staff endpoints (`/api/admin/*`, `/api/technicians`) strictly enforce `isAdmin` on the server (`requireAdmin`), returning `403` to non-staff accounts. Public ticket tracking strips reporter PII (`reporter_id` and `reporter` object are omitted).
- **Rate Limiting**: Authenticated users are capped at 5 non-demo issue submissions per rolling hour (`429` response if exceeded).
- **Upload Safety**: Uploaded files are inspected by binary magic bytes (`FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`) rather than trusting file extensions, assigned random UUID filenames, and confined with `path.resolve` checks inside `data/uploads/`.
- **CSRF & Origin Guard**: Mutating API routes require the `X-Requested-With: CampusCare` custom header and validate `Origin` against allowed server/proxy hosts.
- **No Exposed Secrets**: `GEMINI_API_KEY` and `ADMIN_PASSCODE` are strictly server-side; `VITE_*` variables are never used for private keys.

---

## Local Setup & Scripts

### Prerequisites
- **Node.js `>= 22.5.0`** (required for the built-in `node:sqlite` module)
- **npm** (or Bun)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Required for the AI Campus Assistant (/api/chat)
GEMINI_API_KEY="your_gemini_api_key"

# Base URL where the app runs (used for origin verification & HTTPS cookies)
APP_URL="http://localhost:3000"

# Optional staff admin passcode (leave blank to use first-run setup on /admin/login)
ADMIN_PASSCODE=
```

### 3. Available Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Express + Vite middleware on **http://localhost:3000** |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `NODE_ENV=production npm start` | Serves the compiled production app + API on port `3000` |
| `npm run clean` | Removes `dist/` build output |

---

## License

Built for **Madhav Institute of Technology & Science (MITS), Gwalior**.
