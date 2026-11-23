import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  Droplets,
  Fan,
  LampCeiling,
  Laptop,
  MonitorPlay,
  Search,
  Sparkles,
  ThermometerSnowflake,
  Wifi,
  Wrench,
  Zap,
} from 'lucide-react';
import { Campus3DScene } from '@/src/components/Campus3DScene';
import { FloorPlanSVG } from '@/src/components/FloorPlanSVG';
import { MagneticButton } from '@/src/components/MagneticButton';
import { MitsLogo } from '@/src/components/MitsLogo';
import { getStats, subscribeToIssues } from '@/src/lib/data';
import type { CampusStats, Room } from '@/src/types/campus';

const HERO_WORDS = ['Fix', 'your', 'campus.', 'Together.'];

const STEPS = [
  {
    num: '01',
    title: 'Spot it',
    desc: 'Notice a flickering projector in Smart Class FF-01, a dead Wi-Fi zone near Colloquium, or a leaking tap.',
  },
  {
    num: '02',
    title: 'Report it',
    desc: 'Pick the exact room on the MITS floor plan or scan a classroom QR deep link and attach up to 3 photos.',
  },
  {
    num: '03',
    title: 'Track it',
    desc: 'Get a live ticket ID (CC-2048) with realtime timeline updates from acknowledgment to technician dispatch.',
  },
  {
    num: '04',
    title: 'Fixed',
    desc: 'Verified repairs feed directly into the campus heatmap so chronic hotspots get permanent upgrades.',
  },
];

const BENTO_CATEGORIES = [
  {
    name: 'Projectors',
    detail: 'Smart classes, seminar halls & auditorium AV',
    Icon: MonitorPlay,
    span: 'md:col-span-2',
  },
  {
    name: 'Wi-Fi',
    detail: 'Access points & lab LAN drops',
    Icon: Wifi,
    span: 'md:col-span-1',
  },
  {
    name: 'Electrical',
    detail: 'Sockets, panels & power backup',
    Icon: Zap,
    span: 'md:col-span-1',
  },
  {
    name: 'AC',
    detail: 'Split units & central cooling',
    Icon: ThermometerSnowflake,
    span: 'md:col-span-1',
  },
  {
    name: 'Plumbing/Washroom',
    detail: 'Washrooms, taps & water coolers',
    Icon: Droplets,
    span: 'md:col-span-1',
  },
  {
    name: 'Lights',
    detail: 'Tube lights, corridors & lab bays',
    Icon: LampCeiling,
    span: 'md:col-span-1',
  },
  {
    name: 'Fans',
    detail: 'Ceiling & exhaust ventilation',
    Icon: Fan,
    span: 'md:col-span-1',
  },
  {
    name: 'Equipment',
    detail: 'Lab rigs, workshops & computing',
    Icon: Laptop,
    span: 'md:col-span-1',
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const load = async () => {
    try {
      const s = await getStats();
      setStats(s);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    void load();
    const unsub = subscribeToIssues(() => {
      void load();
    });
    return unsub;
  }, []);

  const buildingOpenCounts = (stats?.by_building ?? []).reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.building] = item.open;
      return acc;
    },
    {},
  );

  const handleRoomPick = (room: Room) => {
    navigate(`/report?room=${encodeURIComponent(room.id)}`);
  };

  return (
    <div className="space-y-24 pb-12">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2.5">
              <MitsLogo size={26} />
              <p className="text-xs font-medium tracking-wide text-cyan-300">
                MITS Gwalior · Campus Maintenance &amp; Issue Tracker
              </p>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.08]">
              {HERO_WORDS.map((word, idx) => (
                <motion.span
                  key={word}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.35,
                    delay: idx * 0.08,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className={`inline-block mr-3 ${
                    idx >= 2
                      ? 'bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-400 bg-clip-text text-transparent'
                      : ''
                  }`}
                >
                  {word}
                </motion.span>
              ))}
            </h1>

            <p className="text-base sm:text-lg text-slate-300/90 max-w-xl leading-relaxed">
              Pinpoint broken classroom projectors, lab equipment, Wi-Fi dead zones, or washroom
              repairs across MITS Gwalior in under 30 seconds and watch every ticket move to
              resolution.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <MagneticButton
                type="button"
                onClick={() => navigate('/report')}
                className="px-6 py-3 rounded-2xl text-sm font-semibold btn-gradient text-white inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span>Report an issue</span>
                <ArrowRight className="w-4 h-4" />
              </MagneticButton>

              <Link
                to="/track"
                className="px-5 py-3 rounded-2xl text-sm font-medium border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-100 inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Search className="w-4 h-4 text-cyan-300" />
                <span>Track complaints</span>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <Campus3DScene
              compact
              openCountsByBuilding={buildingOpenCounts}
              onSelectBuilding={(sel) => navigate(`/report?room=${encodeURIComponent(sel.sampleRoomId)}`)}
            />
          </div>
        </div>

        {/* Live Counters Strip (Strictly from DB aggregates) */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Issues reported</p>
              <p className="font-mono-tabular text-2xl sm:text-3xl font-semibold text-white mt-1">
                {loadingStats ? '—' : stats?.total_reported ?? 0}
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono-tabular">
              {stats ? `${stats.open_count} open` : 'Live DB'}
            </span>
          </div>

          <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Resolved this week</p>
              <p className="font-mono-tabular text-2xl sm:text-3xl font-semibold text-emerald-300 mt-1">
                {loadingStats ? '—' : stats?.resolved_this_week ?? 0}
              </p>
            </div>
            <span className="text-xs text-slate-400">7-day window</span>
          </div>

          <div className="glass-card rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Avg. fix time</p>
              <p className="font-mono-tabular text-2xl sm:text-3xl font-semibold text-cyan-300 mt-1">
                {loadingStats
                  ? '—'
                  : stats?.avg_fix_hours !== null && stats?.avg_fix_hours !== undefined
                    ? `${stats.avg_fix_hours}h`
                    : 'No resolved data'}
              </p>
            </div>
            <span className="text-xs text-slate-400">Verified tickets</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="max-w-2xl space-y-2">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
            From classroom glitch to verified fix
          </h2>
          <p className="text-sm sm:text-base text-slate-400">
            Four clear steps built around MITS Gwalior buildings, labs, and workshops.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((step) => (
            <div key={step.num} className="glass-card glass-card-hover rounded-2xl p-6 space-y-3">
              <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                {step.num}
              </span>
              <h3 className="font-display text-lg font-semibold text-white">{step.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bento Grid of Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Report across every campus system
            </h2>
            <p className="text-sm text-slate-400">
              Categories automatically adapt to classrooms, labs, workshops, and washrooms.
            </p>
          </div>
          <Link
            to="/report"
            className="text-sm font-medium text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1.5"
          >
            <span>Open full report wizard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {BENTO_CATEGORIES.map(({ name, detail, Icon, span }) => (
            <button
              key={name}
              type="button"
              onClick={() => navigate(`/report?category=${encodeURIComponent(name)}`)}
              className={`glass-card glass-card-hover rounded-2xl p-5 text-left flex flex-col justify-between gap-6 ${span}`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center text-cyan-300">
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold text-white">{name}</h3>
                <p className="text-xs text-slate-400 mt-1">{detail}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Interactive Campus Heatmap Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-white">
              Live MITS Gwalior floor heatmap
            </h2>
            <p className="text-sm text-slate-400">
              Click any room on the Ground or First Floor plan to pre-fill a maintenance report.
            </p>
          </div>
          <Link
            to="/campus-3d"
            className="text-sm font-medium text-violet-300 hover:text-violet-200 inline-flex items-center gap-1.5"
          >
            <Building2 className="w-4 h-4" />
            <span>Explore 3D Campus</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-9 glass-card rounded-2xl p-4 sm:p-5">
            <FloorPlanSVG
              roomCounts={stats?.room_counts ?? []}
              heatmapMode
              onSelectRoom={handleRoomPick}
            />
          </div>

          <div className="lg:col-span-3 glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-sm font-semibold text-white">
                Top 5 hotspot rooms
              </h3>
            </div>

            {stats && stats.top_problem_rooms.length > 0 ? (
              <div className="space-y-2.5">
                {stats.top_problem_rooms.map((r) => (
                  <button
                    key={r.room_id}
                    type="button"
                    onClick={() => navigate(`/report?room=${encodeURIComponent(r.room_id)}`)}
                    className="w-full text-left p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                        {r.room_id}
                      </span>
                      <span className="font-mono-tabular text-xs text-amber-300">
                        {r.open_count} open
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 truncate">{r.name}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center space-y-2">
                <Sparkles className="w-5 h-5 text-slate-500 mx-auto" />
                <p className="text-xs text-slate-400">
                  No open hotspot rooms recorded yet. Report an issue to populate live analytics.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="glass-card rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border border-cyan-500/20">
          <div className="space-y-2">
            <h2 className="font-display text-2xl font-semibold text-white">
              Spotted something broken on campus?
            </h2>
            <p className="text-sm text-slate-300">
              Sign in with your MITS student account and file a verified report in four quick steps.
            </p>
          </div>
          <Link
            to="/report"
            className="px-6 py-3 rounded-2xl text-sm font-semibold btn-gradient text-white whitespace-nowrap shrink-0"
          >
            Report an issue
          </Link>
        </div>
      </section>
    </div>
  );
}
