import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Search,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { MitsLogo } from '@/src/components/MitsLogo';
import { StatusBadge, UrgencyBadge } from '@/src/components/StatusBadge';
import { useAuth } from '@/src/context/AuthContext';
import { useToast } from '@/src/context/ToastContext';
import { getIssueByTicket, getMyIssues, subscribeToIssues } from '@/src/lib/data';
import type { Issue, IssueStatus, TicketLookupResult } from '@/src/types/campus';

const TIMELINE_ORDER: IssueStatus[] = [
  'reported',
  'acknowledged',
  'assigned',
  'in_progress',
  'resolved',
];

const TIMELINE_LABELS: Record<IssueStatus, string> = {
  reported: 'Reported',
  acknowledged: 'Acknowledged',
  assigned: 'Assigned',
  in_progress: 'In progress',
  resolved: 'Resolved',
};

export function TrackPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTicket = searchParams.get('ticket') ?? '';

  const { user } = useAuth();
  const { pushToast } = useToast();

  const [ticketQuery, setTicketQuery] = useState(initialTicket);
  const [lookupResult, setLookupResult] = useState<TicketLookupResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [myIssues, setMyIssues] = useState<Issue[]>([]);
  const [loadingMyIssues, setLoadingMyIssues] = useState(false);

  const performLookup = useCallback(
    async (ticket: string) => {
      if (!ticket.trim()) return;
      setSearching(true);
      setLookupError(null);
      try {
        const res = await getIssueByTicket(ticket);
        if (!res) {
          setLookupResult(null);
          setLookupError(`No ticket found matching ${ticket.toUpperCase()}.`);
        } else {
          setLookupResult(res);
          setSearchParams({ ticket: res.issue.ticket_id }, { replace: true });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to search ticket';
        setLookupError(msg);
        pushToast({ title: msg, variant: 'error' });
      } finally {
        setSearching(false);
      }
    },
    [pushToast, setSearchParams],
  );

  const loadMyIssues = useCallback(async () => {
    if (!user) {
      setMyIssues([]);
      return;
    }
    setLoadingMyIssues(true);
    try {
      const list = await getMyIssues();
      setMyIssues(list);
    } catch (err) {
      pushToast({
        title: 'Unable to load your reports',
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setLoadingMyIssues(false);
    }
  }, [user, pushToast]);

  useEffect(() => {
    if (initialTicket) {
      void performLookup(initialTicket);
    }
  }, [initialTicket, performLookup]);

  useEffect(() => {
    void loadMyIssues();
  }, [loadMyIssues]);

  useEffect(() => {
    const unsub = subscribeToIssues(() => {
      if (lookupResult?.issue.ticket_id) {
        void performLookup(lookupResult.issue.ticket_id);
      }
      void loadMyIssues();
    });
    return unsub;
  }, [lookupResult?.issue.ticket_id, performLookup, loadMyIssues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void performLookup(ticketQuery);
  };

  const currentStageIdx = lookupResult
    ? TIMELINE_ORDER.indexOf(lookupResult.issue.status)
    : -1;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="max-w-2xl flex items-start gap-3.5">
        <MitsLogo size={40} className="mt-0.5" />
        <div className="space-y-1.5">
          <h1 className="font-display text-3xl font-bold text-white">Track campus complaints</h1>
          <p className="text-sm text-slate-400">
            Enter any ticket ID (such as CC-2048) for live status, or browse your submitted reports below.
          </p>
        </div>
      </div>

      {/* Ticket Search */}
      <form
        onSubmit={handleSubmit}
        className="glass-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-3"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={ticketQuery}
            onChange={(e) => setTicketQuery(e.target.value)}
            placeholder="Enter ticket ID (e.g. CC-2048)"
            aria-label="Ticket ID"
            className="w-full rounded-xl bg-[#0B101D] border border-white/12 pl-10 pr-4 py-3 text-sm font-mono-tabular text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-6 py-3 rounded-xl text-sm font-semibold btn-gradient text-white whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          {searching ? 'Searching...' : 'Track Ticket'}
        </button>
      </form>

      {lookupError && (
        <div className="glass-card rounded-2xl p-5 border border-amber-400/30 text-sm text-amber-200">
          {lookupError}
        </div>
      )}

      {/* Ticket Detail & Animated Timeline */}
      {lookupResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
        >
          <div className="lg:col-span-7 glass-card rounded-2xl p-6 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono-tabular text-xs font-semibold text-cyan-300">
                  {lookupResult.issue.ticket_id}
                </p>
                <h2 className="font-display text-xl font-semibold text-white mt-1">
                  {lookupResult.issue.title}
                </h2>
              </div>
              <div className="flex items-center gap-2.5">
                <StatusBadge status={lookupResult.issue.status} />
                <UrgencyBadge urgency={lookupResult.issue.urgency} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                {lookupResult.room?.name ?? lookupResult.issue.room_id} ({lookupResult.issue.room_id})
              </span>
              <span className="text-slate-400">·</span>
              <span>{lookupResult.issue.category}</span>
              <span className="text-slate-400">·</span>
              <span className="font-mono-tabular text-slate-400">
                {new Date(lookupResult.issue.created_at).toLocaleString()}
              </span>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              {lookupResult.issue.description}
            </p>

            {lookupResult.issue.photo_urls && lookupResult.issue.photo_urls.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                {lookupResult.issue.photo_urls.map((url, idx) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/40 block"
                  >
                    <img
                      src={url}
                      alt={`Issue evidence ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}

            {/* Technician card */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-300">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">Assigned Technician</p>
                  <p className="text-sm font-semibold text-white">
                    {lookupResult.technician
                      ? `${lookupResult.technician.name} (${lookupResult.technician.specialty.replace('_', ' ')})`
                      : 'Awaiting dispatch'}
                  </p>
                </div>
              </div>
              {lookupResult.technician && (
                <span className="inline-flex items-center gap-1.5 text-xs font-mono-tabular text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" />
                  {lookupResult.technician.phone}
                </span>
              )}
            </div>
          </div>

          {/* Animated Vertical Timeline */}
          <div className="lg:col-span-5 glass-card rounded-2xl p-6 space-y-5">
            <h3 className="font-display text-base font-semibold text-white">Resolution timeline</h3>

            <div className="space-y-4">
              {TIMELINE_ORDER.map((stage, idx) => {
                const reached = idx <= currentStageIdx;
                const event = lookupResult.events.find((e) => e.status === stage);
                return (
                  <motion.div
                    key={stage}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.06 }}
                    className="flex items-start gap-3.5"
                  >
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                          reached
                            ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                            : 'bg-white/[0.03] border-white/10 text-slate-600'
                        }`}
                      >
                        {stage === 'resolved' && reached ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : reached ? (
                          <UserCheck className="w-3.5 h-3.5" />
                        ) : (
                          <Clock className="w-3.5 h-3.5" />
                        )}
                      </div>
                      {idx < TIMELINE_ORDER.length - 1 && (
                        <div
                          className={`w-px h-7 mt-1 ${
                            idx < currentStageIdx ? 'bg-cyan-400/50' : 'bg-white/10'
                          }`}
                        />
                      )}
                    </div>

                    <div className="pt-0.5 space-y-0.5">
                      <p
                        className={`text-sm font-medium ${
                          reached ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {TIMELINE_LABELS[stage]}
                      </p>
                      {event ? (
                        <p className="text-xs text-slate-400">
                          {event.note} ·{' '}
                          <span className="font-mono-tabular">
                            {new Date(event.created_at).toLocaleString()}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">
                          {reached ? 'Completed' : 'Pending'}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* My Reports Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-white">My reports</h2>
          {!user && (
            <Link to="/login?next=/track" className="text-xs font-medium text-cyan-300 hover:underline">
              Sign in to view your personal reports
            </Link>
          )}
        </div>

        {!user ? (
          <div className="glass-card rounded-2xl p-6 text-sm text-slate-400">
            Sign in with your MITS student account to keep a synced list of every issue you have submitted.
          </div>
        ) : loadingMyIssues ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((n) => (
              <div key={n} className="glass-card rounded-2xl p-5 h-28 animate-pulse bg-white/[0.03]" />
            ))}
          </div>
        ) : myIssues.length === 0 ? (
          <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-slate-400">You have not submitted any issue reports yet.</p>
            <Link
              to="/report"
              className="px-4 py-2 rounded-xl text-xs font-semibold btn-gradient text-white w-fit"
            >
              Report an issue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myIssues.map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => {
                  setTicketQuery(issue.ticket_id);
                  void performLookup(issue.ticket_id);
                }}
                className="glass-card glass-card-hover rounded-2xl p-5 text-left space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-semibold text-cyan-300">
                    {issue.ticket_id}
                  </span>
                  <StatusBadge status={issue.status} />
                </div>
                <p className="text-sm font-semibold text-white line-clamp-1">{issue.title}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{issue.room?.name ?? issue.room_id}</span>
                  <span>·</span>
                  <span>{issue.category}</span>
                  <span>·</span>
                  <span className="font-mono-tabular">
                    {new Date(issue.created_at).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
