import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import {
  assignIssueTechnician,
  computeCampusStats,
  createIssueRecord,
  createUserAccount,
  createUserSession,
  deleteSessionByToken,
  ensureAdminForPasscodeLogin,
  getSessionIdentityByToken,
  hasAnyAdmin,
  listIssues,
  listMyIssues,
  listRooms,
  listTechnicians,
  lookupTicket,
  timingSafeEqualStrings,
  updateIssueStatus,
  UPLOAD_DIR,
  verifyUserCredentials,
  type SessionIdentity,
} from './server/db.ts';
import {
  adminClaimSchema,
  assignTechnicianSchema,
  createIssueSchema,
  MAX_PHOTO_BYTES,
  studentSignInSchema,
  studentSignUpSchema,
  ticketLookupSchema,
  updateStatusSchema,
} from './src/lib/validation.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const SESSION_COOKIE_NAME = 'cc_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const SYSTEM_INSTRUCTION = `You are the CampusCare Assistant for Madhav Institute of Technology & Science (MITS), Gwalior.
Your job is to help students, faculty, and estates staff locate rooms, choose the right issue category, submit reports, and understand ticket tracking.

Key MITS Gwalior buildings and sample room IDs:
- Institute Building (Ground Floor GF): GF-CR-004, GF-SC-01..03, GF-SH-01..03, GF-SH-12, GF-CTR-CONCLAVE, GF-CTR-MOOC, GF-CTR-COMP, GF-LAB-BEE, GF-LAB-CIVIL, GF-LAB-HYDRAULICS, GF-LAB-IT1, GF-LAB-AI, GF-LAB-COMP, GF-TOILET-BOYS, GF-TOILET-GIRLS, GF-TOILET-PH.
- Institute Building (First Floor FF): FF-CR-101..119, FF-SC-01..04, FF-HALL-COLLOQ (Colloquium), FF-HALL-SAC (Student Activity Center), FF-SH-11, FF-LAB-PROG3..5, FF-LAB-IOT, FF-LAB-DS1..2, FF-ADM-TNP, FF-ADM-EXAM, FF-TOILET-GIRLS.
- Workshop Block (Ground): WS-CARPENTRY, WS-STORE, WS-FITTING, WS-MACHINE, WS-SMITHY, WS-DUMPSTORE.
- Library: LIB-MAIN, LIB-DIGITAL.
- MBA Block: MBA-MAIN, MBA-SEMINAR.
- Outdoor & Amenities: OUT-CANTEEN, OUT-BADMINTON, OUT-TEMPLE, OUT-COURT-01..06.

Categories: Lights, Fans, Projectors, Wi-Fi, AC, Plumbing/Washroom, Furniture, Electrical, Cleanliness, Equipment, Other.
Keep answers concise (2–4 sentences), practical, and include the exact room ID (e.g. FF-CR-105) whenever relevant so the UI can link directly to reporting.`;

interface IncomingChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface AuthenticatedRequest extends Request {
  auth?: SessionIdentity | null;
  sessionToken?: string | null;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

function isRequestHttps(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.get('x-forwarded-proto');
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') return true;
  const origin = req.get('origin');
  if (typeof origin === 'string' && origin.startsWith('https://')) return true;
  const referer = req.get('referer');
  if (typeof referer === 'string' && referer.startsWith('https://')) return true;
  const appUrl = process.env.APP_URL;
  if (typeof appUrl === 'string' && appUrl.startsWith('https://')) return true;
  return false;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function attachSession(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const bearerToken = extractBearerToken(req);
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME] || null;
  const token = bearerToken || cookieToken;
  req.sessionToken = token;
  req.auth = token ? getSessionIdentityByToken(token) : null;
  next();
}

function getAllowedHosts(req: Request): Set<string> {
  const hosts = new Set<string>();
  const host = req.get('host');
  if (host) hosts.add(host.split(',')[0].trim());
  const fwdHost = req.get('x-forwarded-host');
  if (fwdHost) hosts.add(fwdHost.split(',')[0].trim());
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl !== 'MY_APP_URL') {
    try {
      hosts.add(new URL(appUrl).host);
    } catch {
      // ignore invalid APP_URL
    }
  }
  return hosts;
}

function verifyMutationOrigin(req: Request, res: Response, next: NextFunction): void {
  const hasCustomHeader = req.get('x-requested-with') === 'CampusCare';
  if (req.path !== '/chat' && !hasCustomHeader) {
    res.status(403).json({ error: 'Missing required request header.' });
    return;
  }

  const origin = req.get('origin');
  if (origin && !hasCustomHeader) {
    const allowedHosts = getAllowedHosts(req);
    try {
      const parsedOrigin = new URL(origin);
      if (allowedHosts.size > 0 && !allowedHosts.has(parsedOrigin.host)) {
        res.status(403).json({ error: 'Cross-origin request blocked.' });
        return;
      }
    } catch {
      res.status(403).json({ error: 'Invalid request origin.' });
      return;
    }
  }

  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    return;
  }
  next();
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Staff sign-in required.' });
    return;
  }
  if (!req.auth.isAdmin) {
    res.status(403).json({ error: 'Access restricted to college staff.' });
    return;
  }
  next();
}

function detectImageExtension(buf: Buffer): { ext: 'jpg' | 'png' | 'webp'; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

const sseClients = new Set<Response>();

function broadcastIssuesChanged(): void {
  for (const client of sseClients) {
    try {
      client.write('event: issues_changed\ndata: {}\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);

  // Raw image upload parser before JSON parser for /api/uploads
  app.use(
    '/api/uploads',
    express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      limit: `${MAX_PHOTO_BYTES + 1024}b`,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', attachSession);

  // Apply origin + custom header check to mutating API routes
  app.use('/api', (req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
      verifyMutationOrigin(req, res, next);
      return;
    }
    next();
  });

  // -------------------------------------------------------------------------
  // Auth & Session Routes
  // -------------------------------------------------------------------------

  app.get('/api/auth/me', (req: AuthenticatedRequest, res) => {
    if (!req.auth) {
      res.json({ user: null, profile: null, isAdmin: false, sessionToken: null });
      return;
    }
    res.json({
      ...req.auth,
      sessionToken: req.sessionToken ?? null,
    });
  });

  app.post('/api/auth/register', (req: AuthenticatedRequest, res) => {
    const parsed = studentSignUpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid signup details.' });
      return;
    }

    try {
      const identity = createUserAccount({
        email: parsed.data.email,
        password: parsed.data.password,
        full_name: parsed.data.full_name,
        enrollment_no: parsed.data.enrollment_no,
        role: 'student',
      });
      const session = createUserSession(identity.user.id);
      setSessionCookie(req, res, session.token);
      res.status(201).json({ ...identity, sessionToken: session.token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to register account.';
      const status = message.toLowerCase().includes('already exists') ? 409 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/auth/login', (req: AuthenticatedRequest, res) => {
    const parsed = studentSignInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials.' });
      return;
    }

    const identity = verifyUserCredentials(parsed.data.email, parsed.data.password);
    if (!identity) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const session = createUserSession(identity.user.id);
    setSessionCookie(req, res, session.token);
    res.json({ ...identity, sessionToken: session.token });
  });

  app.get('/api/auth/admin/status', (_req, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim() ?? '';
    const adminExists = hasAnyAdmin();
    res.json({
      needsAdminSetup: !adminExists && envPasscode.length === 0,
      hasEnvPasscode: envPasscode.length > 0,
    });
  });

  app.post('/api/auth/admin/claim', (req: AuthenticatedRequest, res) => {
    const envPasscode = process.env.ADMIN_PASSCODE?.trim() ?? '';
    if (envPasscode.length > 0 || hasAnyAdmin()) {
      res.status(403).json({
        error: 'Staff admin account is already configured. Please use Staff Sign In.',
      });
      return;
    }

    const parsed = adminClaimSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid admin setup input.' });
      return;
    }

    try {
      const identity = createUserAccount({
        email: parsed.data.email,
        password: parsed.data.password,
        full_name: parsed.data.full_name,
        enrollment_no: null,
        role: 'admin',
      });
      const session = createUserSession(identity.user.id);
      setSessionCookie(req, res, session.token);
      res.status(201).json({ ...identity, sessionToken: session.token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to claim admin account.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/admin/login', (req: AuthenticatedRequest, res) => {
    const parsed = studentSignInSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid credentials.' });
      return;
    }

    const envPasscode = process.env.ADMIN_PASSCODE?.trim() ?? '';
    if (envPasscode.length > 0 && timingSafeEqualStrings(parsed.data.password, envPasscode)) {
      const identity = ensureAdminForPasscodeLogin(parsed.data.email);
      const session = createUserSession(identity.user.id);
      setSessionCookie(req, res, session.token);
      res.json({ ...identity, sessionToken: session.token });
      return;
    }

    const identity = verifyUserCredentials(parsed.data.email, parsed.data.password);
    if (!identity) {
      res.status(401).json({ error: 'Invalid staff email or password.' });
      return;
    }

    if (!identity.isAdmin) {
      res.status(403).json({ error: 'Access restricted to college staff' });
      return;
    }

    const session = createUserSession(identity.user.id);
    setSessionCookie(req, res, session.token);
    res.json({ ...identity, sessionToken: session.token });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }
    res.json({
      message:
        'Password recovery for MITS CampusCare accounts is verified through MITS Estates IT Support (estates@mitsgwalior.in).',
    });
  });

  app.post('/api/auth/logout', (req: AuthenticatedRequest, res) => {
    if (req.sessionToken) {
      deleteSessionByToken(req.sessionToken);
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Uploads (Confined Disk Storage)
  // -------------------------------------------------------------------------

  app.post('/api/uploads', requireAuth, (req: AuthenticatedRequest, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Upload a valid JPEG, PNG, or WebP image.' });
      return;
    }
    if (req.body.length > MAX_PHOTO_BYTES) {
      res.status(400).json({ error: 'Image exceeds the 5 MB size limit.' });
      return;
    }

    const detected = detectImageExtension(req.body);
    if (!detected) {
      res.status(400).json({ error: 'Only JPEG, PNG, or WebP images are allowed.' });
      return;
    }

    const filename = `${crypto.randomUUID()}.${detected.ext}`;
    const destPath = path.resolve(UPLOAD_DIR, filename);
    if (!destPath.startsWith(UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    fs.writeFileSync(destPath, req.body);
    res.status(201).json({ url: `/api/uploads/${filename}` });
  });

  app.get('/api/uploads/:filename', (req, res) => {
    const filename = req.params.filename;
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(filename)) {
      res.status(400).json({ error: 'Invalid image filename.' });
      return;
    }

    const targetPath = path.resolve(UPLOAD_DIR, filename);
    if (!targetPath.startsWith(UPLOAD_DIR + path.sep) || !fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Image not found.' });
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(targetPath);
  });

  // -------------------------------------------------------------------------
  // Campus Directory, Stats, Reports & Ticket Tracking Routes
  // -------------------------------------------------------------------------

  app.get('/api/rooms', (_req, res) => {
    res.json(listRooms());
  });

  app.get('/api/stats', (_req, res) => {
    res.json(computeCampusStats());
  });

  app.get('/api/issues/ticket/:ticketId', (req, res) => {
    const parsed = ticketLookupSchema.safeParse(req.params.ticketId);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid ticket ID.' });
      return;
    }

    const result = lookupTicket(parsed.data);
    if (!result) {
      res.status(404).json({ error: `No ticket found matching ${parsed.data}.` });
      return;
    }

    res.json(result);
  });

  app.get('/api/issues/mine', requireAuth, (req: AuthenticatedRequest, res) => {
    const items = listMyIssues(req.auth!.user.id);
    res.json(items);
  });

  app.post('/api/issues', requireAuth, (req: AuthenticatedRequest, res) => {
    const parsed = createIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues[0]?.message ?? 'Invalid issue report details.',
      });
      return;
    }

    try {
      const created = createIssueRecord(req.auth!.user.id, parsed.data);
      broadcastIssuesChanged();
      res.status(201).json(created);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create report.';
      const status =
        message.toLowerCase().includes('rate limit') || message.toLowerCase().includes('limit reached')
          ? 429
          : 400;
      res.status(status).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // Admin Maintenance Routes (Strict Staff Role Enforcement)
  // -------------------------------------------------------------------------

  app.get('/api/technicians', requireAdmin, (_req, res) => {
    res.json(listTechnicians());
  });

  app.get('/api/admin/issues', requireAdmin, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const urgency = typeof req.query.urgency === 'string' ? req.query.urgency : undefined;
    const building = typeof req.query.building === 'string' ? req.query.building : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const includeDemo = req.query.includeDemo !== 'false';

    res.json(listIssues({ status, urgency, building, search, includeDemo }));
  });

  app.patch('/api/admin/issues/:id/status', requireAdmin, (req: AuthenticatedRequest, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid status update.' });
      return;
    }

    try {
      const updated = updateIssueStatus(
        req.params.id,
        parsed.data.status,
        req.auth!.user.id,
        parsed.data.note,
      );
      broadcastIssuesChanged();
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update issue status.';
      const status = message === 'Ticket not found.' ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.patch('/api/admin/issues/:id/assign', requireAdmin, (req: AuthenticatedRequest, res) => {
    const parsed = assignTechnicianSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid technician assignment.' });
      return;
    }

    try {
      const updated = assignIssueTechnician(
        req.params.id,
        parsed.data.technicianId,
        req.auth!.user.id,
      );
      broadcastIssuesChanged();
      res.json(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to assign technician.';
      const status = message === 'Ticket not found.' ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // Realtime Server-Sent Events Stream
  // -------------------------------------------------------------------------

  app.get('/api/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    res.write(': connected\n\n');

    sseClients.add(res);
    const keepAlive = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(keepAlive);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // -------------------------------------------------------------------------
  // Gemini AI Campus Assistant (/api/chat)
  // -------------------------------------------------------------------------

  app.post('/api/chat', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(503).json({
        error: 'Gemini API key is not configured in Settings > Secrets.',
      });
      return;
    }

    const body = req.body as { messages?: IncomingChatMessage[] } | undefined;
    const rawMessages = Array.isArray(body?.messages) ? body.messages : [];
    const sanitized = rawMessages
      .filter(
        (m): m is IncomingChatMessage =>
          (m.role === 'user' || m.role === 'model') &&
          typeof m.text === 'string' &&
          m.text.trim().length > 0,
      )
      .slice(-16);

    // Strip any leading 'model' messages (such as initial UI greeting) so history starts with 'user'
    while (sanitized.length > 0 && sanitized[0].role === 'model') {
      sanitized.shift();
    }

    if (sanitized.length === 0) {
      res.status(400).json({ error: 'Provide at least one message.' });
      return;
    }

    const lastMessage = sanitized[sanitized.length - 1];
    if (lastMessage.role !== 'user') {
      res.status(400).json({ error: 'Last message must be from the user.' });
      return;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const history = sanitized.slice(0, -1).map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      }));

      const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'] as const;
      let replyText: string | undefined;
      let lastErr: unknown;

      for (const modelName of modelsToTry) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const chat = ai.chats.create({
              model: modelName,
              history,
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
              },
            });
            const response = await chat.sendMessage({
              message: lastMessage.text,
            });
            replyText = response.text ?? undefined;
            if (replyText) break;
          } catch (err) {
            lastErr = err;
            const errStatus =
              typeof (err as { status?: unknown })?.status === 'number'
                ? (err as { status: number }).status
                : 500;
            // Only retry / failover on transient availability errors (503 / 500 / 429)
            if (errStatus !== 503 && errStatus !== 500 && errStatus !== 429) {
              throw err;
            }
            if (attempt === 0) {
              await new Promise((resolve) => setTimeout(resolve, 600));
            }
          }
        }
        if (replyText) break;
      }

      if (!replyText && lastErr) {
        throw lastErr;
      }

      res.json({ reply: replyText ?? 'Sorry, I could not generate a response.' });
    } catch (err) {
      const errObj = err as { status?: number; message?: string } | undefined;
      const status = typeof errObj?.status === 'number' ? errObj.status : 500;
      const msg = errObj?.message || (err instanceof Error ? err.message : 'Unknown upstream error');
      console.error('Gemini chat error:', status, msg);

      if (status === 400 || status === 401 || status === 403) {
        res.status(503).json({
          error: 'Please check your Gemini API key in the Settings > Secrets panel.',
        });
        return;
      }
      if (status === 429) {
        res.status(429).json({
          error: 'Assistant quota limit reached. Please try again in a moment.',
        });
        return;
      }
      if (status === 503) {
        res.status(503).json({
          error: 'The AI assistant is temporarily busy due to high demand. Please retry in a few seconds.',
        });
        return;
      }
      res.status(502).json({
        error: 'Unable to reach the CampusCare assistant right now. Please try again shortly.',
      });
    }
  });

  // -------------------------------------------------------------------------
  // Vite Middleware (Dev) & Static Assets (Production)
  // -------------------------------------------------------------------------

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CampusCare server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
