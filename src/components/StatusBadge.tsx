import { AlertTriangle, CheckCircle2, Clock, UserCheck, Wrench, CircleDot } from 'lucide-react';
import type { IssueStatus, IssueUrgency } from '@/src/types/campus';

const STATUS_META: Record<
  IssueStatus,
  { label: string; colorClass: string; Icon: typeof CircleDot }
> = {
  reported: {
    label: 'Reported',
    colorClass: 'text-slate-200 bg-white/[0.06] border-white/15',
    Icon: CircleDot,
  },
  acknowledged: {
    label: 'Acknowledged',
    colorClass: 'text-violet-300 bg-violet-500/12 border-violet-400/30',
    Icon: Clock,
  },
  assigned: {
    label: 'Assigned',
    colorClass: 'text-cyan-300 bg-cyan-500/12 border-cyan-400/30',
    Icon: UserCheck,
  },
  in_progress: {
    label: 'In progress',
    colorClass: 'text-sky-300 bg-sky-500/15 border-sky-400/35',
    Icon: Wrench,
  },
  resolved: {
    label: 'Resolved',
    colorClass: 'text-emerald-300 bg-emerald-500/12 border-emerald-400/30',
    Icon: CheckCircle2,
  },
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  const { label, colorClass, Icon } = STATUS_META[status] ?? STATUS_META.reported;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 ${colorClass}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: IssueUrgency }) {
  if (urgency === 'urgent') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-amber-400/40 bg-amber-500/15 text-amber-300 text-xs font-medium whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Urgent</span>
      </span>
    );
  }
  if (urgency === 'medium') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-300 whitespace-nowrap shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" aria-hidden="true" />
        <span>Medium</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" aria-hidden="true" />
      <span>Low</span>
    </span>
  );
}
