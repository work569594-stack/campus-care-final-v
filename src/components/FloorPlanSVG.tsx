import { useMemo, useState } from 'react';
import { AlertTriangle, Layers } from 'lucide-react';
import { CAMPUS_ROOMS } from '@/src/lib/campus';
import { useSound } from '@/src/context/SoundContext';
import type { Room, RoomIssueSummary } from '@/src/types/campus';

interface FloorPlanSVGProps {
  rooms?: Room[];
  selectedRoomId?: string;
  onSelectRoom?: (room: Room) => void;
  roomCounts?: RoomIssueSummary[];
  heatmapMode?: boolean;
  showNeedsReview?: boolean;
}

export function FloorPlanSVG({
  rooms = CAMPUS_ROOMS,
  selectedRoomId,
  onSelectRoom,
  roomCounts = [],
  heatmapMode = false,
  showNeedsReview = false,
}: FloorPlanSVGProps) {
  const [activeFloor, setActiveFloor] = useState<'GF' | 'FF'>('FF');
  const [hoveredRoom, setHoveredRoom] = useState<Room | null>(null);
  const { play } = useSound();

  const countMap = useMemo(() => {
    const map = new Map<string, RoomIssueSummary>();
    for (const c of roomCounts) {
      map.set(c.room_id, c);
    }
    return map;
  }, [roomCounts]);

  const floorRooms = useMemo(() => {
    return rooms.filter((r) => {
      if (!r.svgBounds) return false;
      if (activeFloor === 'GF') {
        return r.floor === 'GF' || r.building === 'Workshop Block';
      }
      return r.floor === 'FF' || r.building === 'Library' || r.building === 'MBA Block' || r.floor === 'OUTDOOR';
    });
  }, [rooms, activeFloor]);

  const getRoomColors = (room: Room) => {
    const stats = countMap.get(room.id);
    const open = stats?.open_count ?? 0;
    const urgent = stats?.urgent_count ?? 0;
    const isSelected = selectedRoomId === room.id;

    if (isSelected) {
      return {
        fill: 'rgba(6, 182, 212, 0.28)',
        stroke: '#22D3EE',
        strokeWidth: 2,
      };
    }

    if (urgent > 0) {
      return {
        fill: heatmapMode ? 'rgba(245, 158, 11, 0.34)' : 'rgba(245, 158, 11, 0.18)',
        stroke: '#F59E0B',
        strokeWidth: 1.5,
      };
    }

    if (open >= 4) {
      return {
        fill: heatmapMode ? 'rgba(245, 158, 11, 0.24)' : 'rgba(139, 92, 246, 0.24)',
        stroke: '#A78BFA',
        strokeWidth: 1.4,
      };
    }

    if (open > 0) {
      return {
        fill: heatmapMode ? 'rgba(6, 182, 212, 0.22)' : 'rgba(6, 182, 212, 0.14)',
        stroke: '#38BDF8',
        strokeWidth: 1.2,
      };
    }

    if (showNeedsReview && room.needs_review) {
      return {
        fill: 'rgba(245, 158, 11, 0.12)',
        stroke: '#FBBF24',
        strokeWidth: 1.3,
      };
    }

    return {
      fill: 'rgba(15, 23, 42, 0.72)',
      stroke: 'rgba(148, 163, 184, 0.24)',
      strokeWidth: 1,
    };
  };

  const hoveredStats = hoveredRoom ? countMap.get(hoveredRoom.id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/10">
          <button
            type="button"
            data-sound="toggle"
            onClick={() => setActiveFloor('GF')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeFloor === 'GF'
                ? 'bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-white border border-cyan-400/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Ground Floor + Workshop
          </button>
          <button
            type="button"
            data-sound="toggle"
            onClick={() => setActiveFloor('FF')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeFloor === 'FF'
                ? 'bg-gradient-to-r from-cyan-500/25 to-violet-500/25 text-white border border-cyan-400/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            First Floor + Campus Blocks
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/40 border border-cyan-400" />
            Open issue
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/40 border border-amber-400" />
            Urgent / Hotspot
          </span>
          {showNeedsReview && (
            <span className="inline-flex items-center gap-1.5 text-amber-300">
              <AlertTriangle className="w-3.5 h-3.5" />
              Needs room audit
            </span>
          )}
        </div>
      </div>

      <div className="relative rounded-2xl border border-white/10 bg-[#070B14] p-3 sm:p-4 overflow-hidden">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 px-1">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            {activeFloor === 'GF'
              ? 'Institute Building (Ground Floor) & Workshop Block'
              : 'Institute Building (First Floor), Library, MBA & Courts'}
          </span>
          <span className="font-mono-tabular">Click any room to select</span>
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox="0 0 900 460"
            className="w-full min-w-[640px] h-auto select-none"
            role="img"
            aria-label={`MITS Gwalior ${activeFloor === 'GF' ? 'Ground' : 'First'} floor plan`}
          >
            {/* Corridor / building envelope backdrop */}
            <rect
              x="12"
              y="12"
              width="876"
              height="338"
              rx="14"
              fill="rgba(15, 23, 42, 0.35)"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeDasharray="4 4"
            />
            <rect
              x="12"
              y="356"
              width="876"
              height="94"
              rx="14"
              fill="rgba(15, 23, 42, 0.3)"
              stroke="rgba(148, 163, 184, 0.14)"
              strokeDasharray="4 4"
            />

            {floorRooms.map((room) => {
              const b = room.svgBounds!;
              const colors = getRoomColors(room);
              const stats = countMap.get(room.id);
              const open = stats?.open_count ?? 0;
              const urgent = stats?.urgent_count ?? 0;
              const shortLabel = room.id
                .replace('GF-', '')
                .replace('FF-', '')
                .replace('OUT-', '');

              return (
                <g
                  key={room.id}
                  data-cursor="view"
                  role="button"
                  tabIndex={0}
                  aria-label={`${room.name} (${room.width}m by ${room.depth}m), ${open} open issues`}
                  onClick={() => {
                    play('roomSelect');
                    onSelectRoom?.(room);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      play('roomSelect');
                      onSelectRoom?.(room);
                    }
                  }}
                  onMouseEnter={() => setHoveredRoom(room)}
                  onMouseLeave={() => setHoveredRoom((curr) => (curr?.id === room.id ? null : curr))}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx="7"
                    fill={colors.fill}
                    stroke={colors.stroke}
                    strokeWidth={colors.strokeWidth}
                    className="transition-all duration-150 hover:brightness-125"
                  />
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2 - 3}
                    textAnchor="middle"
                    className="fill-slate-100 text-[9px] font-semibold pointer-events-none"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {shortLabel.length > 12 ? shortLabel.slice(0, 11) + '…' : shortLabel}
                  </text>
                  <text
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2 + 11}
                    textAnchor="middle"
                    className="fill-slate-400 text-[8px] pointer-events-none"
                  >
                    {room.width}×{room.depth}m
                  </text>

                  {open > 0 && (
                    <g transform={`translate(${b.x + b.w - 10}, ${b.y + 10})`}>
                      {urgent > 0 && (
                        <circle
                          r="7"
                          className="fill-amber-400/30 animate-pin-pulse"
                          style={{ transformOrigin: 'center' }}
                        />
                      )}
                      <circle
                        r="6.5"
                        fill={urgent > 0 ? '#F59E0B' : '#06B6D4'}
                      />
                      <text
                        y="3"
                        textAnchor="middle"
                        className="fill-[#05070D] text-[8px] font-bold pointer-events-none"
                      >
                        {open}
                      </text>
                    </g>
                  )}

                  {showNeedsReview && room.needs_review && (
                    <circle
                      cx={b.x + 10}
                      cy={b.y + 10}
                      r="4"
                      fill="#FBBF24"
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Live inspection bar */}
        <div className="mt-3 min-h-[40px] flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs">
          {hoveredRoom ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-slate-200">
                <span className="font-semibold text-white">{hoveredRoom.name}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono-tabular text-cyan-300">{hoveredRoom.id}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">
                  {hoveredRoom.width.toFixed(2)}m × {hoveredRoom.depth.toFixed(2)}m
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400">{hoveredRoom.wing}</span>
                {hoveredRoom.needs_review && (
                  <>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-amber-300 font-medium">Needs room audit</span>
                  </>
                )}
              </div>
              <span className="font-mono-tabular text-slate-300">
                {hoveredStats?.open_count ?? 0} open ({hoveredStats?.urgent_count ?? 0} urgent)
              </span>
            </>
          ) : (
            <span className="text-slate-400">
              Hover over any room block to inspect dimensions and live maintenance load.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
