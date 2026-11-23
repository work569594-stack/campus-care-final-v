export type AppRole = 'student' | 'admin';

export type RoomType =
  | 'classroom'
  | 'smart_class'
  | 'lab'
  | 'seminar_hall'
  | 'staff_room'
  | 'hod_office'
  | 'admin'
  | 'toilet'
  | 'common'
  | 'amenity'
  | 'store';

export type FloorCode = 'GF' | 'FF' | 'OUTDOOR';

export type IssueCategory =
  | 'Lights'
  | 'Fans'
  | 'Projectors'
  | 'Wi-Fi'
  | 'AC'
  | 'Plumbing/Washroom'
  | 'Furniture'
  | 'Electrical'
  | 'Cleanliness'
  | 'Equipment'
  | 'Other';

export type IssueUrgency = 'low' | 'medium' | 'urgent';

export type IssueStatus =
  | 'reported'
  | 'acknowledged'
  | 'assigned'
  | 'in_progress'
  | 'resolved';

export type TechnicianSpecialty =
  | 'electrical'
  | 'it_network'
  | 'plumbing'
  | 'carpentry'
  | 'ac';

export interface SvgBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  floor: FloorCode;
  building: string;
  wing: string;
  width: number;
  depth: number;
  needs_review: boolean;
  svgBounds?: SvgBounds;
}

export interface Technician {
  id: string;
  name: string;
  specialty: TechnicianSpecialty;
  phone: string;
  active: boolean;
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  enrollment_no: string | null;
  phone: string | null;
  created_at: string;
}

export interface Issue {
  id: string;
  ticket_id: string;
  room_id: string;
  category: IssueCategory;
  urgency: IssueUrgency;
  title: string;
  description: string;
  photo_urls: string[];
  status: IssueStatus;
  reporter_id: string | null;
  assigned_to: string | null;
  is_demo: boolean;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  // Optional joined fields
  room?: Room | null;
  technician?: Technician | null;
  reporter?: Pick<Profile, 'full_name' | 'email' | 'enrollment_no'> | null;
}

export interface IssueEvent {
  id: string;
  issue_id: string;
  status: IssueStatus;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface TicketLookupResult {
  issue: Issue;
  room: Room | null;
  technician: Technician | null;
  events: IssueEvent[];
}

export interface RoomIssueSummary {
  room_id: string;
  open_count: number;
  urgent_count: number;
  total_count: number;
}

export interface CampusStats {
  total_reported: number;
  open_count: number;
  urgent_open_count: number;
  resolved_this_week: number;
  avg_fix_hours: number | null;
  room_counts: RoomIssueSummary[];
  by_building: { building: string; open: number; resolved: number; total: number }[];
  by_category: { category: string; count: number }[];
  daily_trend: { date: string; reported: number; resolved: number }[];
  top_problem_rooms: {
    room_id: string;
    name: string;
    building: string;
    floor: string;
    open_count: number;
    urgent_count: number;
  }[];
}

export interface CreateIssueInput {
  room_id: string;
  category: IssueCategory;
  urgency: IssueUrgency;
  title: string;
  description: string;
  photo_urls?: string[];
  idempotency_key: string;
}
