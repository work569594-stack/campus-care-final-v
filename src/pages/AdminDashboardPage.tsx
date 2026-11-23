import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flame,
  LayoutGrid,
  Search,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { FloorPlanSVG } from '@/src/components/FloorPlanSVG';
import { MitsLogo } from '@/src/components/MitsLogo';
import { StatusBadge, UrgencyBadge } from '@/src/components/StatusBadge';
import { useSound } from '@/src/context/SoundContext';
import { useToast } from '@/src/context/ToastContext';
import { BUILDINGS, CAMPUS_ROOMS } from '@/src/lib/campus';
import {
  assignTechnician,
  getIssues,
  getRooms,
  getStats,
  getTechnicians,
  subscribeToIssues,
  updateStatus,
} from '@/src/lib/data';
import type {
  CampusStats,
  Issue,
  IssueStatus,
  Room,
  Technician,
} from '@/src/types/campus';

type AdminTab = 'overview' | 'issues' | 'heatmap' | 'technicians';

const PIE_COLORS = ['#06B6D4', '#8B5CF6', '#38BDF8', '#F59E0B', '#10B981', '#6366F1'];

const ALL_STATUSES: IssueStatus[] = [
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'resolved',
];

export function AdminDashboardPage() {
  const { enabled: soundEnabled, toggle: toggleSound, play } = useSound();
  const { pushToast } = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);

  const [issues, setIssues] = useState<Issue[]>([]);
  const [rooms, setRooms] = useState<Room[]>(CAMPUS_ROOMS);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [stats, setStats] = useState<CampusStats | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<IssueStatus | 'all'>('all');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // Slide-over drawer
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [savingDrawer, setSavingDrawer] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [issueList, roomList, techList, campusStats] = await Promise.all([
        getIssues(),
        getRooms(),
        getTechnicians(),
        getStats(),
      ]);
      setIssues(issueList);
      setRooms(roomList);
      setTechnicians(techList);
      setStats(campusStats);
      setSelectedIssue((curr) =>
        curr ? issueList.find((i) => i.id === curr.id) ?? curr : null,
      );
    } catch (err) {
      pushToast({
        title: 'Unable to load admin data',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadAll();
    const unsub = subscribeToIssues(() => {
      void loadAll();
    });
    return unsub;
  }, [loadAll]);

  const filteredIssues = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = issues.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (buildingFilter !== 'all' && i.room?.building !== buildingFilter) return false;
      if (q) {
        return (
          i.ticket_id.toLowerCase().includes(q) ||
          i.title.toLowerCase().includes(q) ||
          i.room_id.toLowerCase().includes(q) ||
          (i.room?.name ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });

    return list.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortAsc ? da - db : db - da;
    });
  }, [issues, statusFilter, buildingFilter, searchQuery, sortAsc]);

  const needsReviewRooms = useMemo(
    () => rooms.filter((r) => r.needs_review),
    [rooms],
  );

  const handleStatusChange = async (issue: Issue, nextStatus: IssueStatus) => {
    const prevIssues = issues;
    // Optimistic update
    setIssues((curr) =>
      curr.map((item) => (item.id === issue.id ? { ...item, status: nextStatus } : item)),
    );
    setSelectedIssue((curr) => (curr?.id === issue.id ? { ...curr, status: nextStatus } : curr));

    setSavingDrawer(true);
    try {
      const updated = await updateStatus(issue.id, nextStatus, statusNote);
      setStatusNote('');
      setIssues((curr) => curr.map((i) => (i.id === updated.id ? updated : i)));
      setSelectedIssue(updated);
      play('success');
      pushToast({
        title: `${issue.ticket_id} updated to ${nextStatus.replace('_', ' ')}`,
        variant: 'success',
      });
    } catch (err) {
      // Rollback optimistic update
      setIssues(prevIssues);
      setSelectedIssue(issue);
      pushToast({
        title: 'Status update failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSavingDrawer(false);
    }
  };

  const handleAssignTech = async (issue: Issue, techId: string) => {
    const prevIssues = issues;
    const techObj = technicians.find((t) => t.id === techId) ?? null;

    setIssues((curr) =>
      curr.map((item) =>
        item.id === issue.id ? { ...item, assigned_to: techId || null, technician: techObj } : item,
      ),
    );
    setSelectedIssue((curr) =>
      curr?.id === issue.id ? { ...curr, assigned_to: techId || null, technician: techObj } : curr,
    );

    setSavingDrawer(true);
    try {
      const updated = await assignTechnician(issue.id, techId || null);
      setIssues((curr) => curr.map((i) => (i.id === updated.id ? updated : i)));
      setSelectedIssue(updated);
      play('toggle');
      pushToast({
        title: techObj ? `Assigned to ${techObj.name}` : 'Technician unassigned',
        variant: 'success',
      });
    } catch (err) {
      setIssues(prevIssues);
      setSelectedIssue(issue);
      pushToast({
        title: 'Assignment failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSavingDrawer(false);
    }
  };

  const navItems: { id: AdminTab; label: string; Icon: typeof LayoutGrid }[] = [
    { id: 'overview', label: 'Overview', Icon: LayoutGrid },
    { id: 'issues', label: 'Issues Table', Icon: ClipboardList },
    { id: 'heatmap', label: 'Heatmap & Audit', Icon: Flame },
    { id: 'technicians', label: 'Technicians', Icon: Users },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] flex">
      {/* Collapsible Sidebar */}
      <aside
        className={`border-r border-white/[0.08] bg-[#070B14] transition-all duration-200 flex flex-col justify-between shrink-0 ${
          collapsed ? 'w-[72px]' : 'w-60'
        }`}
      >
        <div className="p-3 space-y-6">
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between px-1'}`}>
            <div className="flex items-center gap-2.5 overflow-hidden">
              <MitsLogo size={32} />
              {!collapsed && (
                <span className="font-display text-sm font-semibold text-white whitespace-nowrap">
                  MITS Estates
                </span>
              )}
            </div>
          </div>

          <nav className="space-y-1" aria-label="Admin sections">
            {navItems.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  title={collapsed ? label : undefined}
                  className={`w-full flex items-center ${
                    collapsed ? 'justify-center px-2' : 'gap-3 px-3'
                  } py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-cyan-500/15 text-white border border-cyan-400/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/[0.05] border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 text-cyan-300" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 flex items-center justify-center gap-2 text-xs"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">
              Campus Maintenance Console
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Realtime issue dispatch, floor heatmap, and technician SLA tracking
            </p>
          </div>

          <button
            type="button"
            data-sound="toggle"
            onClick={toggleSound}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-xs text-slate-200"
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-cyan-300" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>{soundEnabled ? 'Sounds On' : 'Muted'}</span>
          </button>
        </div>

        {/* KPI Cards with Sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: 'Total Tickets', value: stats?.total_reported ?? 0, tone: 'text-white' },
            { label: 'Open Queue', value: stats?.open_count ?? 0, tone: 'text-cyan-300' },
            { label: 'Urgent Open', value: stats?.urgent_open_count ?? 0, tone: 'text-amber-300' },
            {
              label: 'Avg. Fix Time',
              value:
                stats?.avg_fix_hours !== null && stats?.avg_fix_hours !== undefined
                  ? `${stats.avg_fix_hours}h`
                  : '—',
              tone: 'text-emerald-300',
            },
          ].map((kpi) => (
            <div key={kpi.label} className="glass-card rounded-2xl p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
                <p className={`font-mono-tabular text-2xl font-bold mt-1 ${kpi.tone}`}>
                  {loading ? '—' : kpi.value}
                </p>
              </div>
              <div className="w-20 h-10">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.daily_trend ?? []}>
                    <Area
                      type="monotone"
                      dataKey="reported"
                      stroke="#06B6D4"
                      fill="#06B6D4"
                      fillOpacity={0.18}
                      strokeWidth={1.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 glass-card rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                <h2 className="font-display text-sm font-semibold text-white">
                  Issues by building
                </h2>
              </div>
              <div className="h-64">
                {stats && stats.by_building.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.by_building}>
                      <XAxis dataKey="building" stroke="#94A3B8" fontSize={11} />
                      <YAxis stroke="#94A3B8" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B101D',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="open" name="Open" fill="#06B6D4" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="resolved" name="Resolved" fill="#8B5CF6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No building analytics recorded yet.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 glass-card rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-sm font-semibold text-white">
                Distribution by category
              </h2>
              <div className="h-64">
                {stats && stats.by_category.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.by_category}
                        dataKey="count"
                        nameKey="category"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={3}
                      >
                        {stats.by_category.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B101D',
                          borderColor: 'rgba(255,255,255,0.1)',
                          borderRadius: '12px',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    No category data recorded yet.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-12 glass-card rounded-2xl p-5 space-y-4">
              <h2 className="font-display text-sm font-semibold text-white">
                14-day reported vs resolved trend
              </h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.daily_trend ?? []}>
                    <XAxis dataKey="date" stroke="#94A3B8" fontSize={11} />
                    <YAxis stroke="#94A3B8" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0B101D',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="reported"
                      name="Reported"
                      stroke="#06B6D4"
                      fill="#06B6D4"
                      fillOpacity={0.2}
                    />
                    <Area
                      type="monotone"
                      dataKey="resolved"
                      name="Resolved"
                      stroke="#10B981"
                      fill="#10B981"
                      fillOpacity={0.18}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ISSUES TABLE TAB */}
        {tab === 'issues' && (
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search ticket ID, room, or title..."
                  className="w-full rounded-xl bg-[#0B101D] border border-white/12 pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as IssueStatus | 'all')}
                className="rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2 text-xs text-white"
              >
                <option value="all">All Statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>

              <select
                value={buildingFilter}
                onChange={(e) => setBuildingFilter(e.target.value)}
                className="rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2 text-xs text-white"
              >
                <option value="all">All Buildings</option>
                {BUILDINGS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSortAsc((s) => !s)}
                className="px-3 py-2 rounded-xl border border-white/12 bg-white/[0.04] text-xs text-slate-200"
              >
                Date: {sortAsc ? 'Oldest first' : 'Newest first'}
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
                ))}
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                No issues match your current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-[11px] text-slate-400">
                      <th className="py-3 pr-4 font-medium">Ticket</th>
                      <th className="py-3 pr-4 font-medium">Issue</th>
                      <th className="py-3 pr-4 font-medium">Room</th>
                      <th className="py-3 pr-4 font-medium">Urgency</th>
                      <th className="py-3 pr-4 font-medium">Status</th>
                      <th className="py-3 font-medium">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05] text-sm">
                    {filteredIssues.map((issue) => (
                      <tr
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                      >
                        <td className="py-3 pr-4 font-mono-tabular text-xs font-semibold text-cyan-300 whitespace-nowrap">
                          {issue.ticket_id}
                        </td>
                        <td className="py-3 pr-4 text-slate-100 max-w-[260px] truncate">
                          {issue.title}
                        </td>
                        <td className="py-3 pr-4 font-mono-tabular text-xs text-slate-300 whitespace-nowrap">
                          {issue.room_id}
                        </td>
                        <td className="py-3 pr-4">
                          <UrgencyBadge urgency={issue.urgency} />
                        </td>
                        <td className="py-3 pr-4">
                          <StatusBadge status={issue.status} />
                        </td>
                        <td className="py-3 text-xs text-slate-300 whitespace-nowrap">
                          {issue.technician?.name ?? 'Unassigned'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* HEATMAP & ROOM AUDIT TAB */}
        {tab === 'heatmap' && (
          <div className="space-y-6">
            <div className="glass-card rounded-2xl p-5">
              <FloorPlanSVG
                rooms={rooms}
                roomCounts={stats?.room_counts ?? []}
                heatmapMode
                showNeedsReview
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <h2 className="font-display text-sm font-semibold text-white">
                  Top 5 problem rooms
                </h2>
                {stats && stats.top_problem_rooms.length > 0 ? (
                  <div className="space-y-2">
                    {stats.top_problem_rooms.map((r) => (
                      <div
                        key={r.room_id}
                        className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-white">{r.name}</p>
                          <p className="font-mono-tabular text-slate-400">
                            {r.room_id} · {r.building}
                          </p>
                        </div>
                        <span className="font-mono-tabular text-amber-300 font-semibold">
                          {r.open_count} open
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">No open hotspot rooms yet.</p>
                )}
              </div>

              <div className="glass-card rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <h2 className="font-display text-sm font-semibold text-white">
                    Rooms flagged for physical verification ({needsReviewRooms.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {needsReviewRooms.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/25 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-amber-200">{r.name}</p>
                        <p className="font-mono-tabular text-amber-300/80">
                          {r.id} · {r.width}×{r.depth}m · {r.wing}
                        </p>
                      </div>
                      <span className="text-amber-200 font-medium">Needs review</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TECHNICIANS TAB */}
        {tab === 'technicians' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {technicians.length === 0 ? (
              <div className="glass-card rounded-2xl p-6 text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
                No active technicians found.
              </div>
            ) : (
              technicians.map((tech) => (
                <div key={tech.id} className="glass-card rounded-2xl p-5 space-y-2">
                  <p className="font-display text-base font-semibold text-white">{tech.name}</p>
                  <p className="text-xs text-cyan-300 capitalize">
                    Specialty: {tech.specialty.replace('_', ' ')}
                  </p>
                  <p className="font-mono-tabular text-xs text-slate-400">{tech.phone}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Slide-over Issue Detail Drawer */}
      {selectedIssue && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="w-full max-w-md bg-[#090E1A] border-l border-white/10 h-full overflow-y-auto p-6 space-y-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono-tabular text-xs font-semibold text-cyan-300">
                  {selectedIssue.ticket_id}
                </p>
                <h2 className="font-display text-lg font-semibold text-white mt-1">
                  {selectedIssue.title}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close drawer"
                onClick={() => setSelectedIssue(null)}
                className="p-1.5 rounded-lg bg-white/[0.06] text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge status={selectedIssue.status} />
              <UrgencyBadge urgency={selectedIssue.urgency} />
            </div>

            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1 text-xs">
              <p className="text-slate-400">Location</p>
              <p className="text-sm font-medium text-white">
                {selectedIssue.room?.name ?? selectedIssue.room_id} ({selectedIssue.room_id})
              </p>
              <p className="text-slate-400">{selectedIssue.category}</p>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">{selectedIssue.description}</p>

            {/* Assign Technician */}
            <div className="space-y-2">
              <label htmlFor="assign-tech" className="block text-xs font-medium text-slate-300">
                Assign Technician
              </label>
              <select
                id="assign-tech"
                disabled={savingDrawer}
                value={selectedIssue.assigned_to ?? ''}
                onChange={(e) => void handleAssignTech(selectedIssue, e.target.value)}
                className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2.5 text-sm text-white"
              >
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.specialty.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>

            {/* Update Status + Timeline Note */}
            <div className="space-y-3">
              <label htmlFor="status-note" className="block text-xs font-medium text-slate-300">
                Optional timeline note
              </label>
              <input
                id="status-note"
                type="text"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder="e.g. Ordered replacement projector lamp"
                className="w-full rounded-xl bg-[#0B101D] border border-white/12 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />

              <p className="text-xs font-medium text-slate-300 pt-1">Update status</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    disabled={savingDrawer || selectedIssue.status === st}
                    onClick={() => void handleStatusChange(selectedIssue, st)}
                    className={`py-2 px-3 rounded-xl text-xs font-medium capitalize border transition-colors ${
                      selectedIssue.status === st
                        ? 'bg-cyan-500/20 border-cyan-400 text-white'
                        : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.08] text-slate-300'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
