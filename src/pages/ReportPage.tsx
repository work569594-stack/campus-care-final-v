import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MapPin,
  Search,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { FloorPlanSVG } from '@/src/components/FloorPlanSVG';
import { MitsLogo } from '@/src/components/MitsLogo';
import { StatusBadge, UrgencyBadge } from '@/src/components/StatusBadge';
import { useAuth } from '@/src/context/AuthContext';
import { useSound } from '@/src/context/SoundContext';
import { useToast } from '@/src/context/ToastContext';
import { BUILDINGS, CAMPUS_ROOMS, getCategoriesForRoomType, getRoomById } from '@/src/lib/campus';
import { createIssue, getRooms, getStats } from '@/src/lib/data';
import { createIssueSchema, MAX_PHOTOS, validateImageFile } from '@/src/lib/validation';
import type { Issue, IssueCategory, IssueUrgency, Room, RoomIssueSummary } from '@/src/types/campus';

const STEP_TITLES = [
  '1. Location',
  '2. Category',
  '3. Details & Photos',
  '4. Review & Submit',
];

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function ReportPage() {
  const [searchParams] = useSearchParams();
  const initialRoomParam = searchParams.get('room') ?? '';
  const initialCatParam = (searchParams.get('category') as IssueCategory | null) ?? null;

  const { refreshProfile } = useAuth();
  const { play } = useSound();
  const { pushToast } = useToast();

  const [rooms, setRooms] = useState<Room[]>(CAMPUS_ROOMS);
  const [roomCounts, setRoomCounts] = useState<RoomIssueSummary[]>([]);
  const [step, setStep] = useState(1);

  // Location state
  const [selectedRoomId, setSelectedRoomId] = useState<string>(initialRoomParam);
  const [buildingFilter, setBuildingFilter] = useState<string>('Institute Building');
  const [floorFilter, setFloorFilter] = useState<string>('ALL');
  const [roomSearch, setRoomSearch] = useState('');

  // Form fields
  const [category, setCategory] = useState<IssueCategory>(initialCatParam ?? 'Projectors');
  const [urgency, setUrgency] = useState<IssueUrgency>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Submission + idempotency
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [createdTicket, setCreatedTicket] = useState<Issue | null>(null);

  useEffect(() => {
    getRooms().then((dbRooms) => {
      setRooms(dbRooms);
      if (initialRoomParam) {
        const found = dbRooms.find((r) => r.id === initialRoomParam);
        if (found) {
          setBuildingFilter(found.building);
          setFloorFilter(found.floor);
          setSelectedRoomId(found.id);
        }
      }
    });
    getStats().then((s) => setRoomCounts(s.room_counts));
  }, [initialRoomParam]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? getRoomById(selectedRoomId),
    [rooms, selectedRoomId],
  );

  const availableCategories = useMemo(
    () => getCategoriesForRoomType(selectedRoom?.type),
    [selectedRoom],
  );

  useEffect(() => {
    if (selectedRoom && !availableCategories.includes(category)) {
      setCategory(availableCategories[0]);
    }
  }, [selectedRoom, availableCategories, category]);

  const filteredRooms = useMemo(() => {
    const q = roomSearch.trim().toLowerCase();
    return rooms.filter((r) => {
      if (!q && r.building !== buildingFilter) return false;
      if (!q && floorFilter !== 'ALL' && r.floor !== floorFilter) return false;
      if (q) {
        return (
          r.id.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.wing.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rooms, buildingFilter, floorFilter, roomSearch]);

  const handleFilesSelected = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files];
    for (const file of Array.from(incoming)) {
      if (next.length >= MAX_PHOTOS) {
        pushToast({
          title: `Maximum ${MAX_PHOTOS} photos allowed`,
          variant: 'error',
        });
        break;
      }
      const err = validateImageFile(file);
      if (err) {
        pushToast({ title: err, variant: 'error' });
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const goNext = () => {
    setFieldError(null);
    if (step === 1 && !selectedRoom) {
      play('error');
      setFieldError('Please pick a room on the floor plan or from the campus selector.');
      return;
    }
    if (step === 3) {
      const check = createIssueSchema.safeParse({
        room_id: selectedRoomId,
        category,
        urgency,
        title,
        description,
        idempotency_key: idempotencyKey,
      });
      if (!check.success) {
        play('error');
        setFieldError(check.error.issues[0]?.message ?? 'Check your issue summary and details.');
        return;
      }
    }
    play('stepNext');
    setStep((s) => Math.min(4, s + 1));
  };

  const goBack = () => {
    setFieldError(null);
    play('stepBack');
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setFieldError(null);

    const check = createIssueSchema.safeParse({
      room_id: selectedRoomId,
      category,
      urgency,
      title,
      description,
      idempotency_key: idempotencyKey,
    });
    if (!check.success) {
      play('error');
      setFieldError(check.error.issues[0]?.message ?? 'Please check all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await createIssue(
        {
          room_id: selectedRoomId,
          category,
          urgency,
          title,
          description,
          idempotency_key: idempotencyKey,
        },
        files,
      );
      setCreatedTicket(created);
      play('success');
      pushToast({
        title: `Ticket ${created.ticket_id} submitted`,
        description: 'Your report has been saved and added to tracking history.',
        variant: 'success',
      });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        confetti({
          particleCount: 85,
          spread: 68,
          origin: { y: 0.6 },
          colors: ['#06B6D4', '#8B5CF6', '#38BDF8', '#F8FAFC'],
        });
      }
    } catch (err) {
      play('error');
      const msg = err instanceof Error ? err.message : 'Unable to submit issue right now';
      if (msg.toLowerCase().includes('session has expired') || msg.toLowerCase().includes('sign in')) {
        void refreshProfile();
      }
      setFieldError(msg);
      pushToast({
        title: 'Report submission failed',
        description: msg,
        variant: 'error',
        retryLabel: 'Retry submit',
        onRetry: () => void handleSubmit(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (createdTicket) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-14">
        <div className="glass-card rounded-2xl p-8 text-center space-y-6 border border-cyan-500/25">
          <div className="flex items-center justify-center gap-3">
            <MitsLogo size={40} />
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-emerald-300">Ticket registered in CampusCare</p>
            <h1 className="font-mono-tabular text-3xl sm:text-4xl font-bold text-white">
              {createdTicket.ticket_id}
            </h1>
            <p className="text-sm text-slate-300 max-w-md mx-auto">
              {createdTicket.title} · {selectedRoom?.name ?? createdTicket.room_id}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <StatusBadge status={createdTicket.status} />
            <UrgencyBadge urgency={createdTicket.urgency} />
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <Link
              to={`/track?ticket=${encodeURIComponent(createdTicket.ticket_id)}`}
              className="px-6 py-3 rounded-2xl text-sm font-semibold btn-gradient text-white"
            >
              Track this issue
            </Link>
            <Link
              to="/track"
              className="px-5 py-3 rounded-2xl text-sm font-medium border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200"
            >
              View my reports
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreatedTicket(null);
                setStep(1);
                setTitle('');
                setDescription('');
                setFiles([]);
                setIdempotencyKey(createIdempotencyKey());
              }}
              className="px-5 py-3 rounded-2xl text-sm font-medium border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200"
            >
              Report another issue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <MitsLogo size={40} className="mt-0.5" />
          <div className="space-y-1.5">
            <h1 className="font-display text-3xl font-bold text-white">Report a campus issue</h1>
            <p className="text-sm text-slate-400">
              Select a room on the MITS Gwalior map, describe the problem, and get a live ticket ID.
            </p>
          </div>
        </div>

        {selectedRoom && (
          <div className="glass-card rounded-xl px-3.5 py-2 flex items-center gap-2 text-xs text-slate-200">
            <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-semibold text-white">{selectedRoom.name}</span>
            <span className="text-slate-500">·</span>
            <span className="font-mono-tabular text-cyan-300">{selectedRoom.id}</span>
          </div>
        )}
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {STEP_TITLES.map((label, idx) => {
          const num = idx + 1;
          const active = step === num;
          const completed = step > num;
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (num < step) {
                  play('stepBack');
                  setStep(num);
                }
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-medium text-left border transition-colors ${
                active
                  ? 'bg-cyan-500/15 border-cyan-400/45 text-white'
                  : completed
                    ? 'bg-white/[0.04] border-white/15 text-emerald-300 cursor-pointer'
                    : 'bg-white/[0.02] border-white/[0.06] text-slate-500 cursor-default'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {fieldError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/35 bg-amber-500/12 px-4 py-3 text-sm text-amber-200 flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{fieldError}</span>
        </div>
      )}

      {/* Step 1: Location */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="building-select" className="block text-xs text-slate-400 mb-1.5">
                  Building
                </label>
                <select
                  id="building-select"
                  value={buildingFilter}
                  onChange={(e) => {
                    setBuildingFilter(e.target.value);
                    setFloorFilter('ALL');
                  }}
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  {BUILDINGS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="floor-select" className="block text-xs text-slate-400 mb-1.5">
                  Floor
                </label>
                <select
                  id="floor-select"
                  value={floorFilter}
                  onChange={(e) => setFloorFilter(e.target.value)}
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  <option value="ALL">All Floors</option>
                  <option value="GF">Ground Floor (GF)</option>
                  <option value="FF">First Floor (FF)</option>
                  <option value="OUTDOOR">Outdoor</option>
                </select>
              </div>

              <div>
                <label htmlFor="room-search" className="block text-xs text-slate-400 mb-1.5">
                  Search room code or name
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="room-search"
                    type="search"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    placeholder="e.g. FF-CR-105, Colloquium, BEE"
                    className="w-full rounded-xl bg-[#0B101D] border border-white/12 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </div>

            <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-1">
              {filteredRooms.map((r) => {
                const isSelected = r.id === selectedRoomId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      play('roomSelect');
                      setSelectedRoomId(r.id);
                    }}
                    className={`p-3 rounded-xl border text-left transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/20 border-cyan-400 text-white'
                        : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.06] text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                        {r.id}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {r.width}×{r.depth}m
                      </span>
                    </div>
                    <p className="text-xs font-medium mt-1 truncate">{r.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {r.building} · {r.wing}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5">
            <FloorPlanSVG
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              roomCounts={roomCounts}
              onSelectRoom={(room) => setSelectedRoomId(room.id)}
            />
          </div>
        </div>
      )}

      {/* Step 2: Category */}
      {step === 2 && (
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">
              What needs attention in {selectedRoom?.name ?? selectedRoomId}?
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Categories are tailored for this room type ({selectedRoom?.type.replace('_', ' ')}).
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {availableCategories.map((cat) => {
              const active = category === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  data-sound="toggle"
                  onClick={() => setCategory(cat)}
                  className={`p-4 rounded-2xl border text-left transition-colors ${
                    active
                      ? 'bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border-cyan-400 text-white'
                      : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.07] text-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{cat}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Details, Urgency & Photos */}
      {step === 3 && (
        <div className="glass-card rounded-2xl p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="issue-title" className="block text-xs font-medium text-slate-300">
                    Short summary
                  </label>
                  <span className={`text-[11px] font-mono-tabular ${title.trim().length > 0 && title.trim().length < 5 ? 'text-amber-300' : 'text-slate-500'}`}>
                    {title.trim().length}/120 (min 5)
                  </span>
                </div>
                <input
                  id="issue-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  maxLength={120}
                  placeholder={`e.g. ${category} issue in ${selectedRoom?.id ?? 'room'}`}
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="issue-desc" className="block text-xs font-medium text-slate-300">
                    Detailed description
                  </label>
                  <span className={`text-[11px] font-mono-tabular ${description.trim().length > 0 && description.trim().length < 10 ? 'text-amber-300' : 'text-slate-500'}`}>
                    {description.trim().length}/1500 (min 10)
                  </span>
                </div>
                <textarea
                  id="issue-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    if (fieldError) setFieldError(null);
                  }}
                  maxLength={1500}
                  placeholder="Describe exact row, equipment unit, or safety hazard..."
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-300 mb-2">Urgency level</span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['low', 'medium', 'urgent'] as const).map((level) => {
                    const active = urgency === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        data-sound="toggle"
                        onClick={() => setUrgency(level)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold capitalize transition-colors ${
                          active
                            ? level === 'urgent'
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                              : 'bg-cyan-500/20 border-cyan-400 text-white'
                            : 'bg-white/[0.03] border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drag and drop photo upload */}
            <div className="space-y-3">
              <span className="block text-xs font-medium text-slate-300">
                Attach photos (optional, max 3 images · 5 MB each)
              </span>
              <label
                data-cursor="drag"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilesSelected(e.dataTransfer.files);
                }}
                className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/20 hover:border-cyan-400/60 bg-white/[0.02] hover:bg-cyan-500/[0.04] p-6 text-center cursor-pointer transition-colors min-h-[168px]"
              >
                <UploadCloud className="w-7 h-7 text-cyan-300" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">
                    Drag &amp; drop photos or click to browse
                  </p>
                  <p className="text-xs text-slate-400">JPEG, PNG, or WebP · Compressed automatically</p>
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="sr-only"
                />
              </label>

              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2.5">
                  {previews.map((src, idx) => (
                    <div
                      key={src}
                      className="relative rounded-xl overflow-hidden border border-white/10 aspect-square bg-black/40"
                    >
                      <img
                        src={src}
                        alt={`Attachment ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/70 text-white hover:bg-amber-600 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {previews.length === 0 && (
                <p className="text-[11px] text-slate-500 inline-flex items-center gap-1.5">
                  <ImagePlus className="w-3.5 h-3.5" />
                  Photos help technicians bring the right spare parts on the first visit.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Review & Submit */}
      {step === 4 && (
        <div className="glass-card rounded-2xl p-6 space-y-5">
          <h2 className="font-display text-xl font-semibold text-white">Review your report</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-1">
              <p className="text-xs text-slate-400">Room &amp; Building</p>
              <p className="font-semibold text-white">{selectedRoom?.name}</p>
              <p className="font-mono-tabular text-xs text-cyan-300">
                {selectedRoom?.id} · {selectedRoom?.building} · {selectedRoom?.floor}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
              <p className="text-xs text-slate-400">Category &amp; Urgency</p>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-white">{category}</span>
                <UrgencyBadge urgency={urgency} />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-1.5">
            <p className="text-xs text-slate-400">Issue Summary &amp; Description</p>
            <p className="font-semibold text-white">{title}</p>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{description}</p>
          </div>

          {previews.length > 0 && (
            <div className="flex items-center gap-3">
              {previews.map((src, idx) => (
                <img
                  key={src}
                  src={src}
                  alt={`Review attachment ${idx + 1}`}
                  className="w-20 h-20 rounded-xl object-cover border border-white/10"
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom validation alert so errors are visible without scrolling */}
      {fieldError && (
        <div
          role="alert"
          className="rounded-xl border border-amber-400/35 bg-amber-500/12 px-4 py-3 text-sm text-amber-200 flex items-center gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{fieldError}</span>
        </div>
      )}

      {/* Navigation controls */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1 || submitting}
          className="px-4 py-2.5 rounded-xl text-sm font-medium border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 disabled:opacity-40 inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {step < 4 ? (
          <button
            type="button"
            onClick={goNext}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold btn-gradient text-white inline-flex items-center gap-2"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="px-6 py-2.5 rounded-xl text-sm font-semibold btn-gradient text-white disabled:opacity-60 inline-flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{submitting ? 'Submitting ticket...' : 'Submit Issue'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
