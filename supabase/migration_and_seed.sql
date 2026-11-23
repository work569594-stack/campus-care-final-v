-- ============================================================================
-- CampusCare | MITS Gwalior — Complete Supabase Migration & Demo Seed
-- Run this entire script once in the Supabase SQL Editor.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ENUMS
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('student', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.technician_specialty AS ENUM ('electrical', 'it_network', 'plumbing', 'carpentry', 'ac');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_urgency AS ENUM ('low', 'medium', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.issue_status AS ENUM ('reported', 'acknowledged', 'assigned', 'in_progress', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. PROFILES (auto-created via trigger on auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  enrollment_no text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. USER ROLES (separate table; never store roles on profiles)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'student',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, enrollment_no)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'enrollment_no'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    enrollment_no = COALESCE(EXCLUDED.enrollment_no, public.profiles.enrollment_no);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'classroom', 'smart_class', 'lab', 'seminar_hall',
    'staff_room', 'hod_office', 'admin', 'toilet', 'common', 'amenity', 'store'
  )),
  floor text NOT NULL CHECK (floor IN ('GF', 'FF', 'OUTDOOR')),
  building text NOT NULL,
  wing text NOT NULL,
  width numeric(6,2) NOT NULL CHECK (width > 0),
  depth numeric(6,2) NOT NULL CHECK (depth > 0),
  needs_review boolean NOT NULL DEFAULT false
);

-- 5. TECHNICIANS
CREATE TABLE IF NOT EXISTS public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialty public.technician_specialty NOT NULL,
  phone text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

-- 6. ISSUES + TICKET SEQUENCE + RATE LIMIT
CREATE SEQUENCE IF NOT EXISTS public.ticket_seq START 2048;

CREATE TABLE IF NOT EXISTS public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id text UNIQUE NOT NULL,
  room_id text NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN (
    'Lights', 'Fans', 'Projectors', 'Wi-Fi', 'AC',
    'Plumbing/Washroom', 'Furniture', 'Electrical', 'Cleanliness', 'Equipment', 'Other'
  )),
  urgency public.issue_urgency NOT NULL DEFAULT 'medium',
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 5 AND 120),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 10 AND 1500),
  photo_urls text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photo_urls) <= 3),
  status public.issue_status NOT NULL DEFAULT 'reported',
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.technicians(id) ON DELETE SET NULL,
  is_demo boolean NOT NULL DEFAULT false,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_issues_room_id ON public.issues(room_id);
CREATE INDEX IF NOT EXISTS idx_issues_status ON public.issues(status);
CREATE INDEX IF NOT EXISTS idx_issues_reporter_id ON public.issues(reporter_id);
CREATE INDEX IF NOT EXISTS idx_issues_created_at ON public.issues(created_at DESC);

CREATE TABLE IF NOT EXISTS public.issue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL REFERENCES public.issues(id) ON DELETE CASCADE,
  status public.issue_status NOT NULL,
  note text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_issue_events_issue_id ON public.issue_events(issue_id, created_at ASC);

-- Race-safe Ticket ID generator + 5 reports/hour rate limit
CREATE OR REPLACE FUNCTION public.before_insert_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  IF NEW.ticket_id IS NULL OR NEW.ticket_id = '' THEN
    NEW.ticket_id := 'CC-' || nextval('public.ticket_seq')::text;
  END IF;

  IF NEW.is_demo = false AND NEW.reporter_id IS NOT NULL THEN
    SELECT count(*) INTO recent_count
    FROM public.issues
    WHERE reporter_id = NEW.reporter_id
      AND is_demo = false
      AND created_at > now() - interval '1 hour';

    IF recent_count >= 5 THEN
      RAISE EXCEPTION 'Rate limit exceeded: maximum 5 reports per hour per user';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_before_insert_issue ON public.issues;
CREATE TRIGGER trg_before_insert_issue
  BEFORE INSERT ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.before_insert_issue();

CREATE OR REPLACE FUNCTION public.after_issue_insert_or_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.issue_events (issue_id, status, note, actor_id, created_at)
    VALUES (NEW.id, NEW.status, 'Issue reported via CampusCare portal', NEW.reporter_id, NEW.created_at);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.issue_events (issue_id, status, note, actor_id)
      VALUES (
        NEW.id,
        NEW.status,
        CASE NEW.status
          WHEN 'acknowledged' THEN 'Maintenance desk acknowledged the report'
          WHEN 'assigned' THEN 'Assigned to campus technician'
          WHEN 'in_progress' THEN 'Work started on site'
          WHEN 'resolved' THEN 'Issue resolved and verified'
          ELSE 'Status updated'
        END,
        auth.uid()
      );
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL AND NEW.status = OLD.status THEN
      INSERT INTO public.issue_events (issue_id, status, note, actor_id)
      VALUES (NEW.id, NEW.status, 'Technician assignment updated', auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_after_issue_change ON public.issues;
CREATE TRIGGER trg_after_issue_change
  AFTER INSERT OR UPDATE ON public.issues
  FOR EACH ROW EXECUTE FUNCTION public.after_issue_insert_or_status();

-- 7. ROW-LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_events ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Users read own profile or admin reads all" ON public.profiles;
CREATE POLICY "Users read own profile or admin reads all" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- User Roles
DROP POLICY IF EXISTS "Users read own roles or admin reads all" ON public.user_roles;
CREATE POLICY "Users read own roles or admin reads all" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Rooms: public read, admin write
DROP POLICY IF EXISTS "Public read rooms" ON public.rooms;
CREATE POLICY "Public read rooms" ON public.rooms
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage rooms" ON public.rooms;
CREATE POLICY "Admins manage rooms" ON public.rooms
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Technicians: public read, admin write
DROP POLICY IF EXISTS "Public read technicians" ON public.technicians;
CREATE POLICY "Public read technicians" ON public.technicians
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage technicians" ON public.technicians;
CREATE POLICY "Admins manage technicians" ON public.technicians
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Issues: authenticated insert with reporter_id = auth.uid(); student reads own; admin reads/updates all
DROP POLICY IF EXISTS "Authenticated users insert own issues" ON public.issues;
CREATE POLICY "Authenticated users insert own issues" ON public.issues
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND reporter_id = auth.uid()
    AND is_demo = false
  );

DROP POLICY IF EXISTS "Students read own issues and admins read all" ON public.issues;
CREATE POLICY "Students read own issues and admins read all" ON public.issues
  FOR SELECT USING (
    reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins update issues" ON public.issues;
CREATE POLICY "Admins update issues" ON public.issues
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Issue Events
DROP POLICY IF EXISTS "Read events for visible issues" ON public.issue_events;
CREATE POLICY "Read events for visible issues" ON public.issue_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.issues i
      WHERE i.id = issue_events.issue_id
        AND (i.reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

DROP POLICY IF EXISTS "Admins insert issue events" ON public.issue_events;
CREATE POLICY "Admins insert issue events" ON public.issue_events
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. SECURITY DEFINER RPCs (Ticket Lookup + Public Campus Aggregated Stats)
CREATE OR REPLACE FUNCTION public.get_issue_by_ticket(p_ticket text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issue record;
  v_room jsonb;
  v_tech jsonb;
  v_events jsonb;
BEGIN
  SELECT
    id, ticket_id, room_id, category, urgency, title, description,
    photo_urls, status, assigned_to, is_demo, created_at, updated_at, resolved_at
  INTO v_issue
  FROM public.issues
  WHERE upper(ticket_id) = upper(trim(p_ticket))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(r) INTO v_room FROM public.rooms r WHERE r.id = v_issue.room_id;
  IF v_issue.assigned_to IS NOT NULL THEN
    SELECT to_jsonb(t) INTO v_tech FROM public.technicians t WHERE t.id = v_issue.assigned_to;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'issue_id', e.issue_id,
      'status', e.status,
      'note', e.note,
      'created_at', e.created_at
    ) ORDER BY e.created_at ASC
  ), '[]'::jsonb)
  INTO v_events
  FROM public.issue_events e
  WHERE e.issue_id = v_issue.id;

  RETURN jsonb_build_object(
    'issue', to_jsonb(v_issue),
    'room', v_room,
    'technician', v_tech,
    'events', v_events
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_campus_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_open integer;
  v_urgent_open integer;
  v_resolved_week integer;
  v_avg_hours numeric;
  v_room_counts jsonb;
  v_by_building jsonb;
  v_by_category jsonb;
  v_daily_trend jsonb;
  v_top_rooms jsonb;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE status <> 'resolved'),
    count(*) FILTER (WHERE status <> 'resolved' AND urgency = 'urgent'),
    count(*) FILTER (WHERE status = 'resolved' AND resolved_at >= now() - interval '7 days'),
    round(avg(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0) FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1)
  INTO v_total, v_open, v_urgent_open, v_resolved_week, v_avg_hours
  FROM public.issues;

  SELECT COALESCE(jsonb_agg(row_to_json(rc)), '[]'::jsonb) INTO v_room_counts
  FROM (
    SELECT
      room_id,
      count(*) FILTER (WHERE status <> 'resolved') AS open_count,
      count(*) FILTER (WHERE status <> 'resolved' AND urgency = 'urgent') AS urgent_count,
      count(*) AS total_count
    FROM public.issues
    GROUP BY room_id
  ) rc;

  SELECT COALESCE(jsonb_agg(row_to_json(bb)), '[]'::jsonb) INTO v_by_building
  FROM (
    SELECT
      r.building,
      count(*) FILTER (WHERE i.status <> 'resolved') AS open,
      count(*) FILTER (WHERE i.status = 'resolved') AS resolved,
      count(*) AS total
    FROM public.issues i
    JOIN public.rooms r ON r.id = i.room_id
    GROUP BY r.building
    ORDER BY total DESC
  ) bb;

  SELECT COALESCE(jsonb_agg(row_to_json(bc)), '[]'::jsonb) INTO v_by_category
  FROM (
    SELECT category, count(*) AS count
    FROM public.issues
    GROUP BY category
    ORDER BY count DESC
  ) bc;

  SELECT COALESCE(jsonb_agg(row_to_json(dt) ORDER BY dt.day_key), '[]'::jsonb) INTO v_daily_trend
  FROM (
    SELECT
      to_char(d::date, 'Mon DD') AS date,
      d::date AS day_key,
      (SELECT count(*) FROM public.issues i WHERE i.created_at::date = d::date) AS reported,
      (SELECT count(*) FROM public.issues i WHERE i.resolved_at::date = d::date) AS resolved
    FROM generate_series((now() - interval '13 days')::date, now()::date, interval '1 day') AS d
  ) dt;

  SELECT COALESCE(jsonb_agg(row_to_json(tr)), '[]'::jsonb) INTO v_top_rooms
  FROM (
    SELECT
      r.id AS room_id,
      r.name,
      r.building,
      r.floor,
      count(*) FILTER (WHERE i.status <> 'resolved') AS open_count,
      count(*) FILTER (WHERE i.status <> 'resolved' AND i.urgency = 'urgent') AS urgent_count
    FROM public.issues i
    JOIN public.rooms r ON r.id = i.room_id
    WHERE i.status <> 'resolved'
    GROUP BY r.id, r.name, r.building, r.floor
    ORDER BY open_count DESC, urgent_count DESC
    LIMIT 5
  ) tr;

  RETURN jsonb_build_object(
    'total_reported', COALESCE(v_total, 0),
    'open_count', COALESCE(v_open, 0),
    'urgent_open_count', COALESCE(v_urgent_open, 0),
    'resolved_this_week', COALESCE(v_resolved_week, 0),
    'avg_fix_hours', v_avg_hours,
    'room_counts', v_room_counts,
    'by_building', v_by_building,
    'by_category', v_by_category,
    'daily_trend', v_daily_trend,
    'top_problem_rooms', v_top_rooms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_issue_by_ticket(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campus_stats() TO anon, authenticated;

-- 9. STORAGE BUCKET ("issue-photos")
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'issue-photos',
  'issue-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "Public read issue photos" ON storage.objects;
CREATE POLICY "Public read issue photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'issue-photos');

DROP POLICY IF EXISTS "Authenticated upload issue photos" ON storage.objects;
CREATE POLICY "Authenticated upload issue photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'issue-photos'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 10. REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;
ALTER PUBLICATION supabase_realtime ADD TABLE public.issue_events;

-- 11. SEED: MITS GWALIOR ROOMS
INSERT INTO public.rooms (id, name, type, floor, building, wing, width, depth, needs_review) VALUES
  ('GF-CR-004', 'Classroom CR-004', 'classroom', 'GF', 'Institute Building', 'South Wing', 7.20, 9.70, false),
  ('GF-CR-U1', 'Classroom (South Annexe 1)', 'classroom', 'GF', 'Institute Building', 'South Wing', 7.20, 9.70, false),
  ('GF-CR-U2', 'Classroom (South Annexe 2)', 'classroom', 'GF', 'Institute Building', 'South Wing', 7.20, 13.05, false),
  ('GF-SC-01', 'Smart Class GF-01', 'smart_class', 'GF', 'Institute Building', 'Central Atrium', 12.15, 13.00, false),
  ('GF-SC-02', 'Smart Class GF-02', 'smart_class', 'GF', 'Institute Building', 'Central Atrium', 13.10, 10.65, false),
  ('GF-SC-03', 'Smart Class GF-03', 'smart_class', 'GF', 'Institute Building', 'East Wing', 10.60, 13.10, false),
  ('GF-SH-01', 'Seminar Hall SH-1', 'seminar_hall', 'GF', 'Institute Building', 'East Wing', 13.10, 10.60, false),
  ('GF-SH-02', 'Seminar Hall SH-2', 'seminar_hall', 'GF', 'Institute Building', 'East Wing', 13.10, 10.60, false),
  ('GF-SH-03', 'Seminar Hall SH-3', 'seminar_hall', 'GF', 'Institute Building', 'East Wing', 13.10, 10.60, false),
  ('GF-SH-12', 'Seminar Hall SH-12', 'seminar_hall', 'GF', 'Institute Building', 'North Wing', 12.15, 9.75, false),
  ('GF-CTR-CONCLAVE', 'Conclave Centre', 'seminar_hall', 'GF', 'Institute Building', 'Central Atrium', 12.95, 10.60, false),
  ('GF-CTR-MOOC', 'MOOC Center', 'smart_class', 'GF', 'Institute Building', 'Central Atrium', 16.50, 10.65, false),
  ('GF-CTR-ELEARN', 'E-Learning Centre', 'smart_class', 'GF', 'Institute Building', 'Central Atrium', 12.00, 9.50, false),
  ('GF-CTR-FACULTY', 'Faculty Resource Centre', 'staff_room', 'GF', 'Institute Building', 'Central Atrium', 13.12, 7.30, false),
  ('GF-CTR-COMP', 'Computer Centre', 'lab', 'GF', 'Institute Building', 'North Wing', 12.15, 6.40, false),
  ('GF-COM-FOYER', 'Exhibition Foyer (GF)', 'common', 'GF', 'Institute Building', 'Central Atrium', 13.00, 13.25, false),
  ('GF-COM-LOBBY', 'Main Lobby', 'common', 'GF', 'Institute Building', 'Central Atrium', 3.00, 10.60, false),
  ('GF-COM-GCR', 'Girls Common Room', 'common', 'GF', 'Institute Building', 'South Wing', 9.00, 7.50, false),
  ('GF-COM-STAIRS', 'Main Staircase Core', 'common', 'GF', 'Institute Building', 'Central Atrium', 5.50, 6.00, false),
  ('GF-ADM-DIRECTOR', 'Director''s Office', 'admin', 'GF', 'Institute Building', 'Admin Block', 9.50, 7.50, false),
  ('GF-ADM-BOARD', 'Board Room', 'admin', 'GF', 'Institute Building', 'Admin Block', 10.00, 7.50, false),
  ('GF-ADM-OFFICE', 'Main Office', 'admin', 'GF', 'Institute Building', 'Admin Block', 11.00, 7.50, false),
  ('GF-ADM-ACCNT', 'Accountant Office', 'admin', 'GF', 'Institute Building', 'Admin Block', 6.50, 6.00, false),
  ('GF-ADM-AO', 'Administrative Officer', 'admin', 'GF', 'Institute Building', 'Admin Block', 6.50, 6.00, false),
  ('GF-ADM-ACSEC', 'A/C Section', 'admin', 'GF', 'Institute Building', 'Admin Block', 8.00, 6.00, false),
  ('GF-HOD-CIVIL', 'HOD Civil Engineering', 'hod_office', 'GF', 'Institute Building', 'West Wing', 5.80, 7.00, false),
  ('GF-HOD-ELEC', 'HOD Electrical Engineering', 'hod_office', 'GF', 'Institute Building', 'East Wing', 7.03, 6.42, false),
  ('GF-HOD-MECH', 'HOD Mechanical Engineering', 'hod_office', 'GF', 'Institute Building', 'North Wing', 6.45, 5.20, false),
  ('GF-LAB-CIVIL', 'Civil Lab', 'lab', 'GF', 'Institute Building', 'West Wing', 10.65, 7.10, false),
  ('GF-LAB-SURVEY', 'Survey Lab', 'lab', 'GF', 'Institute Building', 'West Wing', 10.65, 7.10, false),
  ('GF-LAB-SOIL', 'Soil & Highway Lab', 'lab', 'GF', 'Institute Building', 'West Wing', 12.00, 9.00, false),
  ('GF-LAB-CONCRETE', 'Concrete & Structure Lab', 'lab', 'GF', 'Institute Building', 'West Wing', 12.00, 9.00, false),
  ('GF-LAB-HYDRAULICS', 'Hydraulics Lab', 'lab', 'GF', 'Institute Building', 'West Wing', 23.50, 10.50, false),
  ('GF-LAB-CHEM', 'Chemical Lab', 'lab', 'GF', 'Institute Building', 'South Wing', 10.65, 12.65, false),
  ('GF-LAB-DARK', 'Dark Room', 'lab', 'GF', 'Institute Building', 'South Wing', 10.65, 3.35, false),
  ('GF-ADM-CHEMDEPT', 'Chemical Dept', 'hod_office', 'GF', 'Institute Building', 'South Wing', 15.30, 7.00, false),
  ('GF-LAB-ELEC', 'Electrical Lab', 'lab', 'GF', 'Institute Building', 'East Wing', 13.00, 7.00, false),
  ('GF-LAB-BEE', 'BEE Lab', 'lab', 'GF', 'Institute Building', 'East Wing', 9.76, 10.60, false),
  ('GF-LAB-POWERSYS', 'Power System Lab', 'lab', 'GF', 'Institute Building', 'East Wing', 12.15, 9.78, false),
  ('GF-LAB-HV', 'High Voltage Lab', 'lab', 'GF', 'Institute Building', 'East Wing', 13.00, 10.50, false),
  ('GF-LAB-IC', 'I.C. Lab', 'lab', 'GF', 'Institute Building', 'East Wing', 13.05, 10.50, false),
  ('GF-LAB-CAM', 'CAM Lab', 'lab', 'GF', 'Institute Building', 'North Wing', 13.05, 10.50, false),
  ('GF-LAB-DYNAMICS', 'Dynamics & Machine Lab', 'lab', 'GF', 'Institute Building', 'North Wing', 10.67, 6.67, false),
  ('GF-LAB-BME1', 'BME Lab 1', 'lab', 'GF', 'Institute Building', 'North Wing', 10.67, 13.35, false),
  ('GF-LAB-BME2', 'BME Lab 2', 'lab', 'GF', 'Institute Building', 'North Wing', 10.67, 6.67, false),
  ('GF-LAB-RAC', 'RAC Lab', 'lab', 'GF', 'Institute Building', 'North Wing', 10.67, 10.02, false),
  ('GF-LAB-BOILER', 'Boiler Lab', 'lab', 'GF', 'Institute Building', 'North Wing', 10.67, 13.35, false),
  ('GF-LAB-IT1', 'IT-1 Lab', 'lab', 'GF', 'Institute Building', 'IT Wing', 10.50, 8.50, false),
  ('GF-LAB-IT2', 'IT-2 Lab', 'lab', 'GF', 'Institute Building', 'IT Wing', 10.50, 8.50, false),
  ('GF-LAB-AI', 'AI Lab', 'lab', 'GF', 'Institute Building', 'IT Wing', 11.00, 9.00, false),
  ('GF-LAB-COMP', 'Computer Lab (GF)', 'lab', 'GF', 'Institute Building', 'IT Wing', 12.00, 9.00, false),
  ('GF-LAB-COMPTL', 'Computational Lab', 'lab', 'GF', 'Institute Building', 'IT Wing', 6.35, 5.20, false),
  ('GF-TOILET-BOYS', 'Boys Washroom (GF)', 'toilet', 'GF', 'Institute Building', 'West Wing', 5.00, 6.00, false),
  ('GF-TOILET-GIRLS', 'Girls Washroom (GF)', 'toilet', 'GF', 'Institute Building', 'South Wing', 5.00, 6.00, false),
  ('GF-TOILET-LADIES', 'Ladies Staff Washroom (GF)', 'toilet', 'GF', 'Institute Building', 'Admin Block', 4.00, 5.00, false),
  ('GF-TOILET-PH', 'Accessible Washroom (PH, GF)', 'toilet', 'GF', 'Institute Building', 'Central Atrium', 4.00, 4.50, false),
  ('WS-CARPENTRY', 'Carpentry Workshop', 'lab', 'GF', 'Workshop Block', 'Workshop Yard', 11.74, 15.10, false),
  ('WS-STORE', 'Workshop Main Store', 'store', 'GF', 'Workshop Block', 'Workshop Yard', 7.84, 15.10, false),
  ('WS-FITTING', 'Fitting Shop', 'lab', 'GF', 'Workshop Block', 'Workshop Yard', 11.90, 15.10, false),
  ('WS-MACHINE', 'Machine Shop', 'lab', 'GF', 'Workshop Block', 'Workshop Yard', 18.20, 15.10, false),
  ('WS-SMITHY', 'Smithy Shop', 'lab', 'GF', 'Workshop Block', 'Workshop Yard', 17.90, 11.85, false),
  ('WS-DUMPSTORE', 'Dumping Store', 'store', 'GF', 'Workshop Block', 'Workshop Yard', 9.10, 6.94, false),
  ('FF-CR-101', 'Classroom CR-101', 'classroom', 'FF', 'Institute Building', 'South Wing', 9.67, 6.95, false),
  ('FF-CR-102', 'Classroom CR-102', 'classroom', 'FF', 'Institute Building', 'South Wing', 9.67, 6.95, false),
  ('FF-CR-103', 'Classroom CR-103', 'classroom', 'FF', 'Institute Building', 'South Wing', 10.65, 13.40, false),
  ('FF-CR-104', 'Classroom CR-104', 'classroom', 'FF', 'Institute Building', 'Central Atrium', 12.15, 9.70, false),
  ('FF-CR-105', 'Classroom CR-105', 'classroom', 'FF', 'Institute Building', 'Central Atrium', 12.15, 9.90, false),
  ('FF-CR-106', 'Classroom CR-106', 'classroom', 'FF', 'Institute Building', 'Central Atrium', 12.15, 9.70, false),
  ('FF-CR-107', 'Classroom CR-107', 'classroom', 'FF', 'Institute Building', 'East Wing', 12.15, 9.90, false),
  ('FF-CR-108', 'Classroom CR-108', 'classroom', 'FF', 'Institute Building', 'East Wing', 9.70, 10.65, false),
  ('FF-CR-109', 'Classroom CR-109', 'classroom', 'FF', 'Institute Building', 'East Wing', 9.80, 10.65, false),
  ('FF-CR-110', 'Classroom CR-110', 'classroom', 'FF', 'Institute Building', 'East Wing', 10.00, 10.65, false),
  ('FF-CR-111', 'Classroom 111 (or duplicate 113)', 'classroom', 'FF', 'Institute Building', 'North Wing', 9.80, 10.65, true),
  ('FF-CR-112', 'Classroom CR-112', 'classroom', 'FF', 'Institute Building', 'North Wing', 10.65, 16.20, false),
  ('FF-CR-113', 'Classroom CR-113', 'classroom', 'FF', 'Institute Building', 'North Wing', 9.80, 10.65, false),
  ('FF-CR-114', 'Classroom CR-114', 'classroom', 'FF', 'Institute Building', 'North Wing', 7.25, 9.75, false),
  ('FF-CR-115', 'Classroom CR-115', 'classroom', 'FF', 'Institute Building', 'North Wing', 7.25, 9.75, false),
  ('FF-CR-116', 'Classroom 116 (Verify)', 'classroom', 'FF', 'Institute Building', 'North Wing', 12.72, 6.95, true),
  ('FF-CR-117', 'Classroom 117 (Verify)', 'classroom', 'FF', 'Institute Building', 'North Wing', 12.72, 6.95, true),
  ('FF-CR-118', 'Classroom CR-118', 'classroom', 'FF', 'Institute Building', 'West Wing', 7.60, 6.95, false),
  ('FF-CR-119', 'Classroom CR-119', 'classroom', 'FF', 'Institute Building', 'West Wing', 7.25, 9.75, false),
  ('FF-SC-01', 'Smart Class FF-01', 'smart_class', 'FF', 'Institute Building', 'Central Atrium', 13.00, 7.00, false),
  ('FF-SC-02', 'Smart Class FF-02', 'smart_class', 'FF', 'Institute Building', 'Central Atrium', 9.60, 10.55, false),
  ('FF-SC-03', 'Smart Class FF-03', 'smart_class', 'FF', 'Institute Building', 'East Wing', 9.60, 10.55, false),
  ('FF-SC-04', 'Smart Class FF-04', 'smart_class', 'FF', 'Institute Building', 'West Wing', 12.80, 10.55, false),
  ('FF-HALL-COLLOQ', 'Colloquium Hall', 'seminar_hall', 'FF', 'Institute Building', 'Central Atrium', 30.90, 10.65, false),
  ('FF-HALL-SAC', 'Student Activity Center', 'common', 'FF', 'Institute Building', 'Central Atrium', 30.90, 10.65, false),
  ('FF-SH-11', 'Seminar Hall 11', 'seminar_hall', 'FF', 'Institute Building', 'East Wing', 12.15, 9.70, false),
  ('FF-COM-FOYER', 'Exhibition Foyer (FF)', 'common', 'FF', 'Institute Building', 'Central Atrium', 13.00, 13.25, false),
  ('FF-ADM-TNP', 'Training & Placement Center', 'admin', 'FF', 'Institute Building', 'South Wing', 7.25, 9.75, false),
  ('FF-ADM-EXAM', 'Examination Center', 'admin', 'FF', 'Institute Building', 'South Wing', 12.00, 9.50, false),
  ('FF-LAB-PROG3', 'Programming Lab 3', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 12.50, false),
  ('FF-LAB-PROG4', 'Programming Lab 4', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 8.00, false),
  ('FF-LAB-PROG5', 'Programming Lab 5', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 12.50, false),
  ('FF-LAB-HWMP', 'Hardware / Microprocessor Lab', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 12.50, false),
  ('FF-LAB-IOT', 'IoT Lab', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 8.00, false),
  ('FF-LAB-COMPUTING', 'Computing Lab', 'lab', 'FF', 'Institute Building', 'IT Wing', 8.00, 12.50, false),
  ('FF-LAB-DS1', 'Data Science Lab 1', 'lab', 'FF', 'Institute Building', 'IT Wing', 9.00, 8.50, false),
  ('FF-LAB-DS2', 'Data Science Lab 2', 'lab', 'FF', 'Institute Building', 'IT Wing', 9.00, 8.50, false),
  ('FF-LAB-GIS', 'GIS Lab', 'lab', 'FF', 'Institute Building', 'West Wing', 8.50, 8.00, false),
  ('FF-LAB-BE', 'BE Lab', 'lab', 'FF', 'Institute Building', 'East Wing', 9.00, 8.00, false),
  ('FF-LAB-MUP', 'MUP Lab', 'lab', 'FF', 'Institute Building', 'East Wing', 9.00, 8.00, false),
  ('FF-CTR-RESEARCH', 'New Research Centre', 'lab', 'FF', 'Institute Building', 'North Wing', 12.00, 9.00, false),
  ('FF-ADM-ITDEPT', 'IT Department Office', 'hod_office', 'FF', 'Institute Building', 'IT Wing', 8.00, 6.50, false),
  ('FF-HOD-CHAMBER', 'HOD Chamber (FF)', 'hod_office', 'FF', 'Institute Building', 'IT Wing', 6.50, 5.50, false),
  ('FF-ADM-CONF', 'Conference Hall', 'seminar_hall', 'FF', 'Institute Building', 'Central Atrium', 10.50, 7.50, false),
  ('FF-ADM-MEETING', 'Meeting Room', 'admin', 'FF', 'Institute Building', 'Central Atrium', 6.50, 5.50, false),
  ('FF-LIB-READING', 'Department Library (FF)', 'common', 'FF', 'Institute Building', 'South Wing', 10.00, 8.00, false),
  ('FF-TUT-01', 'Tutorial Room 1', 'classroom', 'FF', 'Institute Building', 'South Wing', 7.00, 6.50, false),
  ('FF-TUT-02', 'Tutorial Room 2', 'classroom', 'FF', 'Institute Building', 'South Wing', 7.00, 6.50, false),
  ('FF-TUT-03', 'Tutorial Room 3', 'classroom', 'FF', 'Institute Building', 'South Wing', 7.00, 6.50, false),
  ('FF-TOILET-GIRLS', 'Girls Washroom (FF)', 'toilet', 'FF', 'Institute Building', 'South Wing', 5.20, 6.00, false),
  ('FF-TOILET-BOYS-E', 'Boys Washroom East (FF)', 'toilet', 'FF', 'Institute Building', 'East Wing', 5.20, 6.00, false),
  ('FF-TOILET-BOYS-W', 'Boys Washroom West (FF)', 'toilet', 'FF', 'Institute Building', 'West Wing', 5.20, 6.00, false),
  ('FF-COM-TERRACE1', 'Terrace 1 (North)', 'common', 'FF', 'Institute Building', 'North Wing', 12.00, 8.00, false),
  ('FF-COM-TERRACE2', 'Terrace 2 (South)', 'common', 'FF', 'Institute Building', 'South Wing', 12.00, 8.00, false),
  ('FF-COM-TERRACE3', 'Terrace 3 (East)', 'common', 'FF', 'Institute Building', 'East Wing', 10.00, 8.00, false),
  ('FF-COM-TERRACE4', 'Terrace 4 (West)', 'common', 'FF', 'Institute Building', 'West Wing', 10.00, 8.00, false),
  ('FF-COM-OPENCOURT', 'First Floor Open Court', 'common', 'FF', 'Institute Building', 'Central Atrium', 14.00, 12.00, false),
  ('LIB-MAIN', 'Central Library Reading Hall', 'common', 'GF', 'Library', 'Library Block', 24.00, 18.00, false),
  ('LIB-DIGITAL', 'Digital Library & E-Journal Zone', 'lab', 'FF', 'Library', 'Library Block', 16.00, 12.00, false),
  ('MBA-MAIN', 'MBA Block Lecture Hall', 'classroom', 'GF', 'MBA Block', 'West Campus', 14.00, 11.00, false),
  ('MBA-SEMINAR', 'MBA Seminar & Case Room', 'seminar_hall', 'FF', 'MBA Block', 'West Campus', 14.00, 10.50, false),
  ('OUT-CANTEEN', 'Campus Canteen & Food Court', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 18.00, 14.00, false),
  ('OUT-BADMINTON', 'New Badminton Court', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 16.00, 12.00, false),
  ('OUT-TEMPLE', 'Campus Temple Precinct', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 10.00, 10.00, false),
  ('OUT-COURT-01', 'Open Court 1', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false),
  ('OUT-COURT-02', 'Open Court 2', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false),
  ('OUT-COURT-03', 'Open Court 3', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false),
  ('OUT-COURT-04', 'Open Court 4', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false),
  ('OUT-COURT-05', 'Open Court 5', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false),
  ('OUT-COURT-06', 'Open Court 6', 'amenity', 'OUTDOOR', 'Outdoor & Amenities', 'Campus Grounds', 15.00, 12.00, false)
ON CONFLICT (id) DO NOTHING;

-- Insert GF-STAFF-01..22, WS-STAFF-01..04, FF-STAFF-01..20
INSERT INTO public.rooms (id, name, type, floor, building, wing, width, depth, needs_review)
SELECT
  'GF-STAFF-' || lpad(n::text, 2, '0'),
  'Staff Room GF-' || lpad(n::text, 2, '0'),
  'staff_room', 'GF', 'Institute Building',
  (ARRAY['South Wing','Central Atrium','East Wing','North Wing','West Wing'])[(n % 5) + 1],
  4.20, 3.80, false
FROM generate_series(1, 22) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rooms (id, name, type, floor, building, wing, width, depth, needs_review)
SELECT
  'WS-STAFF-' || lpad(n::text, 2, '0'),
  'Workshop Staff Room ' || lpad(n::text, 2, '0'),
  'staff_room', 'GF', 'Workshop Block', 'Workshop Yard', 3.62, 3.20, false
FROM generate_series(1, 4) AS n
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rooms (id, name, type, floor, building, wing, width, depth, needs_review)
SELECT
  'FF-STAFF-' || lpad(n::text, 2, '0'),
  'Staff Room FF-' || lpad(n::text, 2, '0'),
  'staff_room', 'FF', 'Institute Building',
  (ARRAY['South Wing','Central Atrium','East Wing','IT Wing','West Wing'])[(n % 5) + 1],
  4.20, 3.80, false
FROM generate_series(1, 20) AS n
ON CONFLICT (id) DO NOTHING;

-- 12. SEED: 5 CAMPUS TECHNICIANS
INSERT INTO public.technicians (name, specialty, phone, active)
SELECT * FROM (VALUES
  ('Rajesh Sharma', 'electrical'::public.technician_specialty, '+91 94251-10421', true),
  ('Ankit Verma', 'it_network'::public.technician_specialty, '+91 98262-33814', true),
  ('Mahesh Kushwah', 'plumbing'::public.technician_specialty, '+91 97541-22098', true),
  ('Devendra Tomar', 'carpentry'::public.technician_specialty, '+91 94257-61904', true),
  ('Suresh Chouhan', 'ac'::public.technician_specialty, '+91 98931-74512', true)
) AS v(name, specialty, phone, active)
WHERE NOT EXISTS (SELECT 1 FROM public.technicians LIMIT 1);

-- 13. SEED: 80 REALISTIC DEMO ISSUES (is_demo = true)
-- Concentrated in 10 hotspot rooms across the last 30 days and all statuses.
DO $$
DECLARE
  v_elec uuid;
  v_it uuid;
  v_plumb uuid;
  v_carp uuid;
  v_ac uuid;
  v_idx integer;
  v_rooms text[] := ARRAY[
    'FF-CR-105', 'FF-SC-01', 'FF-HALL-COLLOQ', 'GF-LAB-BEE', 'GF-LAB-COMP',
    'FF-TOILET-GIRLS', 'WS-MACHINE', 'GF-SH-01', 'FF-LAB-IOT', 'GF-CR-004'
  ];
  v_cats text[] := ARRAY[
    'Lights', 'Projectors', 'Wi-Fi', 'Fans', 'Equipment',
    'Plumbing/Washroom', 'Electrical', 'AC', 'Furniture', 'Cleanliness'
  ];
  v_titles text[] := ARRAY[
    'Tube light flickering near front row',
    'Smart projector lamp dimming intermittently',
    'Wi-Fi dead zone near east entrance',
    'Ceiling fan making loud bearing noise',
    'Power outlet strip sparking on lab bench',
    'Washroom tap leaking continuously',
    'Lathe safety shield hinge loose',
    'Split AC blowing warm air during afternoon lecture',
    'Broken student desk arm-rest on row 4',
    'Exhaust fan stopped working in lab bay'
  ];
  v_statuses public.issue_status[] := ARRAY['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved'];
  v_urgencies public.issue_urgency[] := ARRAY['low', 'medium', 'urgent'];
  v_room text;
  v_cat text;
  v_status public.issue_status;
  v_urgency public.issue_urgency;
  v_created timestamptz;
  v_resolved timestamptz;
  v_tech uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.issues WHERE is_demo = true) THEN
    RETURN;
  END IF;

  SELECT id INTO v_elec FROM public.technicians WHERE specialty = 'electrical' LIMIT 1;
  SELECT id INTO v_it FROM public.technicians WHERE specialty = 'it_network' LIMIT 1;
  SELECT id INTO v_plumb FROM public.technicians WHERE specialty = 'plumbing' LIMIT 1;
  SELECT id INTO v_carp FROM public.technicians WHERE specialty = 'carpentry' LIMIT 1;
  SELECT id INTO v_ac FROM public.technicians WHERE specialty = 'ac' LIMIT 1;

  FOR v_idx IN 1..80 LOOP
    -- Weight first 6 rooms more heavily so heatmap hotspots are vivid
    v_room := v_rooms[((v_idx * 7 + (v_idx % 3)) % 10) + 1];
    v_cat := v_cats[((v_idx - 1) % 10) + 1];
    v_status := v_statuses[((v_idx - 1) % 5) + 1];
    v_urgency := CASE WHEN v_idx % 5 = 0 THEN 'urgent' WHEN v_idx % 2 = 0 THEN 'medium' ELSE 'low' END;
    v_created := now() - ((v_idx % 28) || ' days')::interval - ((v_idx % 12) || ' hours')::interval;
    v_resolved := CASE WHEN v_status = 'resolved' THEN v_created + interval '14 hours' ELSE NULL END;

    v_tech := CASE
      WHEN v_status IN ('assigned', 'in_progress', 'resolved') THEN
        CASE v_cat
          WHEN 'Wi-Fi' THEN v_it
          WHEN 'Projectors' THEN v_it
          WHEN 'Plumbing/Washroom' THEN v_plumb
          WHEN 'Furniture' THEN v_carp
          WHEN 'AC' THEN v_ac
          ELSE v_elec
        END
      ELSE NULL
    END;

    INSERT INTO public.issues (
      room_id, category, urgency, title, description,
      status, assigned_to, is_demo, created_at, updated_at, resolved_at
    ) VALUES (
      v_room,
      v_cat,
      v_urgency,
      v_titles[((v_idx - 1) % 10) + 1] || ' (' || v_room || ')',
      'Seeded MITS Gwalior maintenance report #' || v_idx || ' logged for ' || v_room || '. Reported by campus observer for operational verification.',
      v_status,
      v_tech,
      true,
      v_created,
      COALESCE(v_resolved, v_created + interval '2 hours'),
      v_resolved
    );
  END LOOP;
END $$;

-- ============================================================================
-- PROMOTE AN ACCOUNT TO ADMIN (Run after signing up your staff account)
-- Replace 'your-admin-email@mitsgwalior.in' with your exact Supabase auth email:
-- ============================================================================
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'admin'::public.app_role
-- FROM auth.users
-- WHERE email = 'your-admin-email@mitsgwalior.in'
-- ON CONFLICT (user_id, role) DO NOTHING;
