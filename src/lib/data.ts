import { ApiError, apiFetch, getSessionToken } from '@/src/lib/api';
import { CAMPUS_ROOMS, ROOM_MAP } from '@/src/lib/campus';
import {
  compressIssueImage,
  createIssueSchema,
  MAX_PHOTOS,
  ticketLookupSchema,
  validateImageFile,
} from '@/src/lib/validation';
import type {
  CampusStats,
  CreateIssueInput,
  Issue,
  IssueStatus,
  Room,
  Technician,
  TicketLookupResult,
} from '@/src/types/campus';

const EMPTY_STATS: CampusStats = {
  total_reported: 0,
  open_count: 0,
  urgent_open_count: 0,
  resolved_this_week: 0,
  avg_fix_hours: null,
  room_counts: [],
  by_building: [],
  by_category: [],
  daily_trend: [],
  top_problem_rooms: [],
};

export async function getRooms(): Promise<Room[]> {
  try {
    const data = await apiFetch<Room[]>('/api/rooms');
    if (!Array.isArray(data) || data.length === 0) {
      return CAMPUS_ROOMS;
    }
    return data.map((row) => ({
      ...row,
      width: Number(row.width),
      depth: Number(row.depth),
      svgBounds: row.svgBounds ?? ROOM_MAP.get(row.id)?.svgBounds,
    }));
  } catch {
    return CAMPUS_ROOMS;
  }
}

export async function getTechnicians(): Promise<Technician[]> {
  return apiFetch<Technician[]>('/api/technicians');
}

export async function getIssues(filters?: {
  status?: IssueStatus | 'all';
  urgency?: string;
  building?: string;
  search?: string;
  includeDemo?: boolean;
}): Promise<Issue[]> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.urgency && filters.urgency !== 'all') params.set('urgency', filters.urgency);
  if (filters?.building && filters.building !== 'all') params.set('building', filters.building);
  if (filters?.search?.trim()) params.set('search', filters.search.trim());
  if (filters?.includeDemo === false) params.set('includeDemo', 'false');

  const query = params.toString();
  return apiFetch<Issue[]>(query ? `/api/admin/issues?${query}` : '/api/admin/issues');
}

export async function getMyIssues(): Promise<Issue[]> {
  try {
    return await apiFetch<Issue[]>('/api/issues/mine');
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return [];
    }
    throw err;
  }
}

export async function getIssueByTicket(ticketId: string): Promise<TicketLookupResult | null> {
  const parsed = ticketLookupSchema.safeParse(ticketId);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid ticket ID');
  }

  try {
    return await apiFetch<TicketLookupResult>(
      `/api/issues/ticket/${encodeURIComponent(parsed.data)}`,
    );
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

export async function uploadIssuePhoto(file: File): Promise<string> {
  const validationError = validateImageFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  const compressed = await compressIssueImage(file);
  const headers: Record<string, string> = {
    'Content-Type': compressed.type,
    'X-Requested-With': 'CampusCare',
  };
  const token = getSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch('/api/uploads', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: compressed,
  });

  const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !payload.url) {
    throw new Error(payload.error || 'Failed to upload photo attachment.');
  }

  return payload.url;
}

export async function createIssue(
  input: CreateIssueInput,
  files: File[] = [],
): Promise<Issue> {
  if (files.length > MAX_PHOTOS) {
    throw new Error(`You can attach up to ${MAX_PHOTOS} photos.`);
  }
  for (const f of files) {
    const err = validateImageFile(f);
    if (err) throw new Error(err);
  }

  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid report fields');
  }

  const uploadedUrls: string[] = [...(parsed.data.photo_urls ?? [])];
  for (const file of files) {
    const url = await uploadIssuePhoto(file);
    uploadedUrls.push(url);
  }

  return apiFetch<Issue>('/api/issues', {
    method: 'POST',
    body: JSON.stringify({
      ...parsed.data,
      photo_urls: uploadedUrls,
    }),
  });
}

export async function updateStatus(
  issueId: string,
  status: IssueStatus,
  note?: string,
): Promise<Issue> {
  return apiFetch<Issue>(`/api/admin/issues/${encodeURIComponent(issueId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note: note?.trim() || undefined }),
  });
}

export async function assignTechnician(
  issueId: string,
  technicianId: string | null,
): Promise<Issue> {
  return apiFetch<Issue>(`/api/admin/issues/${encodeURIComponent(issueId)}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ technicianId }),
  });
}

export async function getStats(): Promise<CampusStats> {
  try {
    const raw = await apiFetch<Partial<CampusStats>>('/api/stats');
    return {
      total_reported: raw.total_reported ?? 0,
      open_count: raw.open_count ?? 0,
      urgent_open_count: raw.urgent_open_count ?? 0,
      resolved_this_week: raw.resolved_this_week ?? 0,
      avg_fix_hours: raw.avg_fix_hours ?? null,
      room_counts: raw.room_counts ?? [],
      by_building: raw.by_building ?? [],
      by_category: raw.by_category ?? [],
      daily_trend: raw.daily_trend ?? [],
      top_problem_rooms: raw.top_problem_rooms ?? [],
    };
  } catch {
    return EMPTY_STATS;
  }
}

export function subscribeToIssues(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const source = new EventSource('/api/events/stream');
  const handler = () => onChange();
  source.addEventListener('issues_changed', handler);

  return () => {
    source.removeEventListener('issues_changed', handler);
    source.close();
  };
}
