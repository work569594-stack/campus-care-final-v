import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { CAMPUS_ROOMS } from '../src/lib/campus.ts';
import type {
  AppRole,
  CampusStats,
  CreateIssueInput,
  Issue,
  IssueCategory,
  IssueEvent,
  IssueStatus,
  IssueUrgency,
  Profile,
  Room,
  RoomIssueSummary,
  Technician,
  TicketLookupResult,
} from '../src/types/campus.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATA_DIR = path.resolve(__dirname, '../data');
export const UPLOAD_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_PATH = path.resolve(DATA_DIR, 'campuscare.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT,
    enrollment_no TEXT,
    phone TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
    PRIMARY KEY (user_id, role)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    floor TEXT NOT NULL,
    building TEXT NOT NULL,
    wing TEXT NOT NULL,
    width REAL NOT NULL,
    depth REAL NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS technicians (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    phone TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL UNIQUE,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    category TEXT NOT NULL,
    urgency TEXT NOT NULL CHECK (urgency IN ('low', 'medium', 'urgent')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    photo_urls TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported', 'acknowledged', 'assigned', 'in_progress', 'resolved')),
    reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_to TEXT REFERENCES technicians(id) ON DELETE SET NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS issue_events (
    id TEXT PRIMARY KEY,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('reported', 'acknowledged', 'assigned', 'in_progress', 'resolved')),
    note TEXT,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_issues_ticket ON issues(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_issues_reporter ON issues(reporter_id);
  CREATE INDEX IF NOT EXISTS idx_issues_room ON issues(room_id);
  CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_issues_created ON issues(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_issue ON issue_events(issue_id);
`);

// ---------------------------------------------------------------------------
// Password & token cryptography
// ---------------------------------------------------------------------------

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = crypto.scryptSync(password, salt, 64);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ---------------------------------------------------------------------------
// Initial Seed (Rooms, Technicians, Ticket Sequence, Demo Campus History)
// ---------------------------------------------------------------------------

function seedInitialData(): void {
  const upsertRoom = db.prepare(`
    INSERT INTO rooms (id, name, type, floor, building, wing, width, depth, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      floor = excluded.floor,
      building = excluded.building,
      wing = excluded.wing,
      width = excluded.width,
      depth = excluded.depth,
      needs_review = excluded.needs_review
  `);

  db.exec('BEGIN');
  try {
    for (const r of CAMPUS_ROOMS) {
      upsertRoom.run(
        r.id,
        r.name,
        r.type,
        r.floor,
        r.building,
        r.wing,
        r.width,
        r.depth,
        r.needs_review ? 1 : 0,
      );
    }

    const techCountRow = db.prepare('SELECT COUNT(*) AS count FROM technicians').get() as {
      count: number;
    };
    if (techCountRow.count === 0) {
      const insertTech = db.prepare(`
        INSERT INTO technicians (id, name, specialty, phone, active)
        VALUES (?, ?, ?, ?, 1)
      `);
      insertTech.run('tech-01', 'Rajesh Verma', 'electrical', '+91-98260-11401');
      insertTech.run('tech-02', 'Ankit Tiwari', 'it_network', '+91-98260-11402');
      insertTech.run('tech-03', 'Suresh Kushwah', 'plumbing', '+91-98260-11403');
      insertTech.run('tech-04', 'Manoj Parmar', 'carpentry', '+91-98260-11404');
      insertTech.run('tech-05', 'Deepak Sharma', 'ac', '+91-98260-11405');
    }

    db.prepare(`
      INSERT INTO counters (name, value)
      VALUES ('ticket_seq', 2047)
      ON CONFLICT(name) DO NOTHING
    `).run();

    const issueCountRow = db.prepare('SELECT COUNT(*) AS count FROM issues').get() as {
      count: number;
    };
    if (issueCountRow.count === 0) {
      const demoRooms = [
        'FF-CR-105',
        'FF-SC-01',
        'GF-LAB-BEE',
        'GF-TOILET-BOYS',
        'FF-HALL-COLLOQ',
        'WS-MACHINE',
        'LIB-MAIN',
        'FF-LAB-DS1',
        'GF-CTR-CONCLAVE',
        'OUT-CANTEEN',
        'FF-CR-114',
        'GF-LAB-AI',
        'FF-TOILET-GIRLS',
        'MBA-MAIN',
        'GF-SC-02',
      ];
      const categories: IssueCategory[] = [
        'Projectors',
        'Wi-Fi',
        'Electrical',
        'Plumbing/Washroom',
        'AC',
        'Fans',
        'Lights',
        'Equipment',
        'Furniture',
        'Cleanliness',
      ];
      const urgencies: IssueUrgency[] = ['low', 'medium', 'medium', 'urgent'];
      const techIds = ['tech-01', 'tech-02', 'tech-03', 'tech-04', 'tech-05'];

      const insertIssue = db.prepare(`
        INSERT INTO issues (
          id, ticket_id, room_id, category, urgency, title, description,
          photo_urls, status, reporter_id, assigned_to, is_demo, idempotency_key,
          created_at, updated_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, NULL, ?, 1, NULL, ?, ?, ?)
      `);
      const insertEvent = db.prepare(`
        INSERT INTO issue_events (id, issue_id, status, note, actor_id, created_at)
        VALUES (?, ?, ?, ?, NULL, ?)
      `);

      const now = Date.now();
      for (let i = 1; i <= 80; i++) {
        const ticketId = `CC-${1967 + i}`; // CC-1968 .. CC-2047
        const roomId = demoRooms[i % demoRooms.length];
        const category = categories[i % categories.length];
        const urgency = urgencies[i % urgencies.length];
        const status: IssueStatus =
          i <= 46
            ? 'resolved'
            : i <= 58
              ? 'in_progress'
              : i <= 68
                ? 'assigned'
                : i <= 74
                  ? 'acknowledged'
                  : 'reported';
        const techId =
          status === 'assigned' || status === 'in_progress' || status === 'resolved'
            ? techIds[i % techIds.length]
            : null;
        const createdMs = now - ((81 - i) * 4.1 * 3600 * 1000);
        const createdAt = new Date(createdMs).toISOString();
        const updatedAt = new Date(createdMs + 3 * 3600 * 1000).toISOString();
        const resolvedAt =
          status === 'resolved'
            ? new Date(createdMs + (4 + (i % 14)) * 3600 * 1000).toISOString()
            : null;

        const issueId = crypto.randomUUID();
        const title = `${category} service check in ${roomId}`;
        const description = `Campus inspection and student feedback logged for ${category.toLowerCase()} unit in ${roomId}.`;

        insertIssue.run(
          issueId,
          ticketId,
          roomId,
          category,
          urgency,
          title,
          description,
          status,
          techId,
          createdAt,
          resolvedAt ?? updatedAt,
          resolvedAt,
        );

        insertEvent.run(
          crypto.randomUUID(),
          issueId,
          'reported',
          'Ticket logged in CampusCare',
          createdAt,
        );

        if (status !== 'reported') {
          insertEvent.run(
            crypto.randomUUID(),
            issueId,
            status,
            status === 'resolved' ? 'Verified fixed by MITS Estates' : 'Updated by maintenance desk',
            resolvedAt ?? updatedAt,
          );
        }
      }
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

seedInitialData();

// ---------------------------------------------------------------------------
// Auth & User Queries
// ---------------------------------------------------------------------------

export interface AuthUserRecord {
  id: string;
  email: string;
  full_name: string | null;
  enrollment_no: string | null;
}

export interface SessionIdentity {
  user: AuthUserRecord;
  profile: Profile;
  isAdmin: boolean;
}

export function hasAnyAdmin(): boolean {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM user_roles WHERE role = 'admin'")
    .get() as { count: number };
  return row.count > 0;
}

export function getUserIdentityById(userId: string): SessionIdentity | null {
  const row = db
    .prepare(`
      SELECT u.id, u.email, u.created_at, p.full_name, p.enrollment_no, p.phone
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = ?
    `)
    .get(userId) as
    | {
        id: string;
        email: string;
        created_at: string;
        full_name: string | null;
        enrollment_no: string | null;
        phone: string | null;
      }
    | undefined;

  if (!row) return null;

  const rolesRows = db
    .prepare('SELECT role FROM user_roles WHERE user_id = ?')
    .all(userId) as { role: AppRole }[];
  const isAdmin = rolesRows.some((r) => r.role === 'admin');

  return {
    user: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      enrollment_no: row.enrollment_no,
    },
    profile: {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      enrollment_no: row.enrollment_no,
      phone: row.phone,
      created_at: row.created_at,
    },
    isAdmin,
  };
}

export function createUserAccount(params: {
  email: string;
  password: string;
  full_name: string;
  enrollment_no?: string | null;
  role: AppRole;
}): SessionIdentity {
  const normalizedEmail = params.email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;

  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(params.password);

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, normalizedEmail, passwordHash, now);

    db.prepare(
      'INSERT INTO profiles (id, full_name, email, enrollment_no, phone, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    ).run(id, params.full_name.trim(), normalizedEmail, params.enrollment_no?.trim() ?? null, now);

    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(id, params.role);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const identity = getUserIdentityById(id);
  if (!identity) {
    throw new Error('Failed to load newly created user.');
  }
  return identity;
}

export function verifyUserCredentials(email: string, password: string): SessionIdentity | null {
  const normalizedEmail = email.trim().toLowerCase();
  const row = db
    .prepare('SELECT id, password_hash FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string; password_hash: string } | undefined;

  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  return getUserIdentityById(row.id);
}

export function ensureAdminForPasscodeLogin(email: string): SessionIdentity {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = db
    .prepare('SELECT id FROM users WHERE email = ?')
    .get(normalizedEmail) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "INSERT INTO user_roles (user_id, role) VALUES (?, 'admin') ON CONFLICT DO NOTHING",
    ).run(existing.id);
    const identity = getUserIdentityById(existing.id);
    if (!identity) {
      throw new Error('Unable to load staff profile.');
    }
    return identity;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // Store unmatchable random password hash since passcode authentication was used
  const placeholderHash = hashPassword(crypto.randomBytes(32).toString('hex'));
  const staffName = normalizedEmail.split('@')[0] || 'Estates Staff';

  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(id, normalizedEmail, placeholderHash, now);
    db.prepare(
      'INSERT INTO profiles (id, full_name, email, enrollment_no, phone, created_at) VALUES (?, ?, ?, NULL, NULL, ?)',
    ).run(id, staffName, normalizedEmail, now);
    db.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin')").run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const identity = getUserIdentityById(id);
  if (!identity) {
    throw new Error('Unable to provision staff session.');
  }
  return identity;
}

export function createUserSession(userId: string): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(crypto.randomUUID(), tokenHash, userId, expiresAt, now.toISOString());

  return { token, expiresAt };
}

export function getSessionIdentityByToken(token: string): SessionIdentity | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(tokenHash) as { user_id: string; expires_at: string } | undefined;

  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }

  return getUserIdentityById(row.user_id);
}

export function deleteSessionByToken(token: string): void {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

// ---------------------------------------------------------------------------
// Rooms & Technicians Queries
// ---------------------------------------------------------------------------

export function listRooms(): Room[] {
  const rows = db
    .prepare('SELECT * FROM rooms ORDER BY building ASC, id ASC')
    .all() as Array<{
    id: string;
    name: string;
    type: Room['type'];
    floor: Room['floor'];
    building: string;
    wing: string;
    width: number;
    depth: number;
    needs_review: number;
  }>;

  const localBounds = new Map(CAMPUS_ROOMS.map((r) => [r.id, r.svgBounds]));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    floor: row.floor,
    building: row.building,
    wing: row.wing,
    width: Number(row.width),
    depth: Number(row.depth),
    needs_review: Boolean(row.needs_review),
    svgBounds: localBounds.get(row.id),
  }));
}

export function listTechnicians(): Technician[] {
  const rows = db
    .prepare('SELECT * FROM technicians WHERE active = 1 ORDER BY name ASC')
    .all() as Array<{
    id: string;
    name: string;
    specialty: Technician['specialty'];
    phone: string;
    active: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    specialty: r.specialty,
    phone: r.phone,
    active: Boolean(r.active),
  }));
}

// ---------------------------------------------------------------------------
// Issue Mapping & Queries
// ---------------------------------------------------------------------------

interface JoinedIssueRow {
  id: string;
  ticket_id: string;
  room_id: string;
  category: IssueCategory;
  urgency: IssueUrgency;
  title: string;
  description: string;
  photo_urls: string;
  status: IssueStatus;
  reporter_id: string | null;
  assigned_to: string | null;
  is_demo: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  room_name: string | null;
  room_type: Room['type'] | null;
  room_floor: Room['floor'] | null;
  room_building: string | null;
  room_wing: string | null;
  room_width: number | null;
  room_depth: number | null;
  room_needs_review: number | null;
  tech_name: string | null;
  tech_specialty: Technician['specialty'] | null;
  tech_phone: string | null;
  tech_active: number | null;
  reporter_name: string | null;
  reporter_email: string | null;
  reporter_enrollment_no: string | null;
}

const ISSUE_JOIN_SELECT = `
  SELECT
    i.*,
    r.name AS room_name,
    r.type AS room_type,
    r.floor AS room_floor,
    r.building AS room_building,
    r.wing AS room_wing,
    r.width AS room_width,
    r.depth AS room_depth,
    r.needs_review AS room_needs_review,
    t.name AS tech_name,
    t.specialty AS tech_specialty,
    t.phone AS tech_phone,
    t.active AS tech_active,
    p.full_name AS reporter_name,
    p.email AS reporter_email,
    p.enrollment_no AS reporter_enrollment_no
  FROM issues i
  LEFT JOIN rooms r ON r.id = i.room_id
  LEFT JOIN technicians t ON t.id = i.assigned_to
  LEFT JOIN profiles p ON p.id = i.reporter_id
`;

const SVG_BOUNDS_BY_ROOM = new Map(CAMPUS_ROOMS.map((r) => [r.id, r.svgBounds]));

function mapJoinedIssue(row: JoinedIssueRow, includeReporterPii = false): Issue {
  let photos: string[] = [];
  try {
    const parsed = JSON.parse(row.photo_urls);
    if (Array.isArray(parsed)) {
      photos = parsed.filter((u): u is string => typeof u === 'string');
    }
  } catch {
    photos = [];
  }

  return {
    id: row.id,
    ticket_id: row.ticket_id,
    room_id: row.room_id,
    category: row.category,
    urgency: row.urgency,
    title: row.title,
    description: row.description,
    photo_urls: photos,
    status: row.status,
    reporter_id: includeReporterPii ? row.reporter_id : null,
    assigned_to: row.assigned_to,
    is_demo: Boolean(row.is_demo),
    idempotency_key: row.idempotency_key,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    room: row.room_name
      ? {
          id: row.room_id,
          name: row.room_name,
          type: row.room_type ?? 'classroom',
          floor: row.room_floor ?? 'GF',
          building: row.room_building ?? 'Institute Building',
          wing: row.room_wing ?? '',
          width: Number(row.room_width ?? 0),
          depth: Number(row.room_depth ?? 0),
          needs_review: Boolean(row.room_needs_review),
          svgBounds: SVG_BOUNDS_BY_ROOM.get(row.room_id),
        }
      : null,
    technician: row.assigned_to && row.tech_name
      ? {
          id: row.assigned_to,
          name: row.tech_name,
          specialty: row.tech_specialty ?? 'electrical',
          phone: row.tech_phone ?? '',
          active: Boolean(row.tech_active ?? 1),
        }
      : null,
    reporter: includeReporterPii && row.reporter_id
      ? {
          full_name: row.reporter_name,
          email: row.reporter_email,
          enrollment_no: row.reporter_enrollment_no,
        }
      : null,
  };
}

export function listIssues(filters?: {
  status?: string;
  urgency?: string;
  building?: string;
  search?: string;
  includeDemo?: boolean;
}): Issue[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters?.status && filters.status !== 'all') {
    clauses.push('i.status = ?');
    params.push(filters.status);
  }
  if (filters?.urgency && filters.urgency !== 'all') {
    clauses.push('i.urgency = ?');
    params.push(filters.urgency);
  }
  if (filters?.includeDemo === false) {
    clauses.push('i.is_demo = 0');
  }
  if (filters?.building && filters.building !== 'all') {
    clauses.push('r.building = ?');
    params.push(filters.building);
  }
  if (filters?.search?.trim()) {
    const pattern = `%${filters.search.trim().toLowerCase()}%`;
    clauses.push(
      '(LOWER(i.ticket_id) LIKE ? OR LOWER(i.title) LIKE ? OR LOWER(i.room_id) LIKE ? OR LOWER(r.name) LIKE ?)',
    );
    params.push(pattern, pattern, pattern, pattern);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const sql = `${ISSUE_JOIN_SELECT} ${whereSql} ORDER BY i.created_at DESC`;
  const rows = db.prepare(sql).all(...params) as unknown as JoinedIssueRow[];
  return rows.map((row) => mapJoinedIssue(row, true));
}

export function listMyIssues(userId: string): Issue[] {
  const rows = db
    .prepare(`${ISSUE_JOIN_SELECT} WHERE i.reporter_id = ? ORDER BY i.created_at DESC`)
    .all(userId) as unknown as JoinedIssueRow[];
  return rows.map((row) => mapJoinedIssue(row, true));
}

export function getIssueById(issueId: string): Issue | null {
  const row = db
    .prepare(`${ISSUE_JOIN_SELECT} WHERE i.id = ?`)
    .get(issueId) as unknown as JoinedIssueRow | undefined;
  return row ? mapJoinedIssue(row, true) : null;
}

export function lookupTicket(ticketId: string): TicketLookupResult | null {
  const normalized = ticketId.trim().toUpperCase();
  const row = db
    .prepare(`${ISSUE_JOIN_SELECT} WHERE UPPER(i.ticket_id) = ?`)
    .get(normalized) as unknown as JoinedIssueRow | undefined;

  if (!row) return null;

  const issue = mapJoinedIssue(row, false);
  const events = db
    .prepare('SELECT id, issue_id, status, note, actor_id, created_at FROM issue_events WHERE issue_id = ? ORDER BY created_at ASC')
    .all(issue.id) as unknown as IssueEvent[];

  return {
    issue,
    room: issue.room ?? null,
    technician: issue.technician ?? null,
    events,
  };
}

export function createIssueRecord(reporterId: string, input: CreateIssueInput): Issue {
  const room = db.prepare('SELECT id FROM rooms WHERE id = ?').get(input.room_id) as
    | { id: string }
    | undefined;
  if (!room) {
    throw new Error('Selected room was not found in the campus directory.');
  }

  if (input.idempotency_key) {
    const existing = db
      .prepare('SELECT id FROM issues WHERE idempotency_key = ?')
      .get(input.idempotency_key) as { id: string } | undefined;
    if (existing) {
      const loaded = getIssueById(existing.id);
      if (loaded) return loaded;
    }
  }

  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const recentRow = db
    .prepare(
      'SELECT COUNT(*) AS count FROM issues WHERE reporter_id = ? AND is_demo = 0 AND created_at > ?',
    )
    .get(reporterId, oneHourAgo) as { count: number };

  if (recentRow.count >= 5) {
    throw new Error('Report limit reached: you can submit up to 5 issues per hour.');
  }

  const now = new Date().toISOString();
  const issueId = crypto.randomUUID();
  const photosJson = JSON.stringify(input.photo_urls ?? []);

  db.exec('BEGIN');
  try {
    const seqRow = db
      .prepare(
        "UPDATE counters SET value = value + 1 WHERE name = 'ticket_seq' RETURNING value",
      )
      .get() as { value: number } | undefined;

    const seq = seqRow?.value ?? 2048;
    const ticketId = `CC-${seq}`;

    db.prepare(`
      INSERT INTO issues (
        id, ticket_id, room_id, category, urgency, title, description,
        photo_urls, status, reporter_id, assigned_to, is_demo, idempotency_key,
        created_at, updated_at, resolved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reported', ?, NULL, 0, ?, ?, ?, NULL)
    `).run(
      issueId,
      ticketId,
      input.room_id,
      input.category,
      input.urgency,
      input.title.trim(),
      input.description.trim(),
      photosJson,
      reporterId,
      input.idempotency_key,
      now,
      now,
    );

    db.prepare(`
      INSERT INTO issue_events (id, issue_id, status, note, actor_id, created_at)
      VALUES (?, ?, 'reported', 'Issue submitted via CampusCare', ?, ?)
    `).run(crypto.randomUUID(), issueId, reporterId, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const created = getIssueById(issueId);
  if (!created) {
    throw new Error('Failed to load created issue.');
  }
  return created;
}

export function updateIssueStatus(
  issueId: string,
  status: IssueStatus,
  actorId: string,
  note?: string,
): Issue {
  const existing = db.prepare('SELECT id FROM issues WHERE id = ?').get(issueId) as
    | { id: string }
    | undefined;
  if (!existing) {
    throw new Error('Ticket not found.');
  }

  const now = new Date().toISOString();
  const resolvedAt = status === 'resolved' ? now : null;
  const eventNote =
    note?.trim() ||
    (status === 'resolved'
      ? 'Marked resolved by staff'
      : `Status updated to ${status.replace('_', ' ')}`);

  db.exec('BEGIN');
  try {
    db.prepare(
      'UPDATE issues SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?',
    ).run(status, now, resolvedAt, issueId);

    db.prepare(
      'INSERT INTO issue_events (id, issue_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(crypto.randomUUID(), issueId, status, eventNote, actorId, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = getIssueById(issueId);
  if (!updated) throw new Error('Failed to reload issue.');
  return updated;
}

export function assignIssueTechnician(
  issueId: string,
  technicianId: string | null,
  actorId: string,
): Issue {
  const current = db.prepare('SELECT id, status FROM issues WHERE id = ?').get(issueId) as
    | { id: string; status: IssueStatus }
    | undefined;
  if (!current) {
    throw new Error('Ticket not found.');
  }

  let techName: string | null = null;
  if (technicianId) {
    const tech = db
      .prepare('SELECT id, name FROM technicians WHERE id = ? AND active = 1')
      .get(technicianId) as { id: string; name: string } | undefined;
    if (!tech) {
      throw new Error('Selected technician was not found.');
    }
    techName = tech.name;
  }

  const nextStatus: IssueStatus =
    technicianId && (current.status === 'reported' || current.status === 'acknowledged')
      ? 'assigned'
      : current.status;
  const now = new Date().toISOString();
  const eventNote = techName ? `Assigned to ${techName}` : 'Technician unassigned';

  db.exec('BEGIN');
  try {
    db.prepare(
      'UPDATE issues SET assigned_to = ?, status = ?, updated_at = ? WHERE id = ?',
    ).run(technicianId, nextStatus, now, issueId);

    db.prepare(
      'INSERT INTO issue_events (id, issue_id, status, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(crypto.randomUUID(), issueId, nextStatus, eventNote, actorId, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = getIssueById(issueId);
  if (!updated) throw new Error('Failed to reload issue.');
  return updated;
}

// ---------------------------------------------------------------------------
// Real Aggregated Campus Analytics
// ---------------------------------------------------------------------------

export function computeCampusStats(): CampusStats {
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM issues').get() as { count: number };
  const openRow = db
    .prepare("SELECT COUNT(*) AS count FROM issues WHERE status != 'resolved'")
    .get() as { count: number };
  const urgentOpenRow = db
    .prepare(
      "SELECT COUNT(*) AS count FROM issues WHERE status != 'resolved' AND urgency = 'urgent'",
    )
    .get() as { count: number };

  const weekAgoIso = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const resolvedWeekRow = db
    .prepare(
      "SELECT COUNT(*) AS count FROM issues WHERE status = 'resolved' AND resolved_at >= ?",
    )
    .get(weekAgoIso) as { count: number };

  const avgRow = db
    .prepare(`
      SELECT AVG((julianday(resolved_at) - julianday(created_at)) * 24.0) AS avg_hours
      FROM issues
      WHERE status = 'resolved' AND resolved_at IS NOT NULL
    `)
    .get() as { avg_hours: number | null };

  const roomCounts = db
    .prepare(`
      SELECT
        room_id,
        SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status != 'resolved' AND urgency = 'urgent' THEN 1 ELSE 0 END) AS urgent_count,
        COUNT(*) AS total_count
      FROM issues
      GROUP BY room_id
    `)
    .all() as unknown as RoomIssueSummary[];

  const byBuilding = db
    .prepare(`
      SELECT
        r.building AS building,
        SUM(CASE WHEN i.status != 'resolved' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN i.status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
        COUNT(*) AS total
      FROM issues i
      JOIN rooms r ON r.id = i.room_id
      GROUP BY r.building
      ORDER BY total DESC
    `)
    .all() as unknown as CampusStats['by_building'];

  const byCategory = db
    .prepare(`
      SELECT category, COUNT(*) AS count
      FROM issues
      GROUP BY category
      ORDER BY count DESC
    `)
    .all() as unknown as CampusStats['by_category'];

  const topProblemRooms = db
    .prepare(`
      SELECT
        r.id AS room_id,
        r.name AS name,
        r.building AS building,
        r.floor AS floor,
        SUM(CASE WHEN i.status != 'resolved' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN i.status != 'resolved' AND i.urgency = 'urgent' THEN 1 ELSE 0 END) AS urgent_count
      FROM issues i
      JOIN rooms r ON r.id = i.room_id
      GROUP BY r.id
      HAVING open_count > 0
      ORDER BY open_count DESC, urgent_count DESC
      LIMIT 5
    `)
    .all() as unknown as CampusStats['top_problem_rooms'];

  // Build clean 14-day timeline
  const dailyTrend: CampusStats['daily_trend'] = [];
  const allIssuesDates = db
    .prepare('SELECT created_at, resolved_at FROM issues')
    .all() as Array<{ created_at: string; resolved_at: string | null }>;

  const reportedByDay = new Map<string, number>();
  const resolvedByDay = new Map<string, number>();

  for (const row of allIssuesDates) {
    const cDay = row.created_at.slice(0, 10);
    reportedByDay.set(cDay, (reportedByDay.get(cDay) ?? 0) + 1);
    if (row.resolved_at) {
      const rDay = row.resolved_at.slice(0, 10);
      resolvedByDay.set(rDay, (resolvedByDay.get(rDay) ?? 0) + 1);
    }
  }

  for (let d = 13; d >= 0; d--) {
    const dt = new Date(Date.now() - d * 24 * 3600 * 1000);
    const key = dt.toISOString().slice(0, 10);
    dailyTrend.push({
      date: key.slice(5),
      reported: reportedByDay.get(key) ?? 0,
      resolved: resolvedByDay.get(key) ?? 0,
    });
  }

  return {
    total_reported: totalRow.count,
    open_count: openRow.count,
    urgent_open_count: urgentOpenRow.count,
    resolved_this_week: resolvedWeekRow.count,
    avg_fix_hours: avgRow.avg_hours !== null ? Math.round(avgRow.avg_hours * 10) / 10 : null,
    room_counts: roomCounts,
    by_building: byBuilding,
    by_category: byCategory,
    daily_trend: dailyTrend,
    top_problem_rooms: topProblemRooms,
  };
}
