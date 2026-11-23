import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, MapPin } from 'lucide-react';
import { Campus3DScene, type CampusBuildingSelection } from '@/src/components/Campus3DScene';
import { getStats, subscribeToIssues } from '@/src/lib/data';
import type { CampusStats } from '@/src/types/campus';

export function Campus3DPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [selected, setSelected] = useState<CampusBuildingSelection | null>(null);

  useEffect(() => {
    const load = () => getStats().then(setStats).catch(() => {});
    void load();
    return subscribeToIssues(load);
  }, []);

  const buildingOpenCounts = (stats?.by_building ?? []).reduce<Record<string, number>>(
    (acc, item) => {
      acc[item.building] = item.open;
      return acc;
    },
    {},
  );

  return (
    <div className="relative">
      <Campus3DScene
        openCountsByBuilding={buildingOpenCounts}
        onSelectBuilding={(sel) => setSelected(sel)}
      />

      {selected && (
        <div
          className="fixed top-20 right-4 z-20 max-w-xs w-full rounded-2xl border border-white/15 p-4 space-y-3 shadow-2xl"
          style={{ backgroundColor: 'rgba(11, 16, 29, 0.94)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-mono-tabular text-cyan-300">
                {buildingOpenCounts[selected.building] ?? 0} open issues
              </p>
              <h2 className="font-display text-base font-semibold text-white mt-0.5">
                {selected.building}
              </h2>
            </div>
            <MapPin className="w-4 h-4 text-cyan-400 shrink-0 mt-1" />
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{selected.subtitle}</p>

          <button
            type="button"
            onClick={() =>
              navigate(`/report?room=${encodeURIComponent(selected.sampleRoomId)}`)
            }
            className="w-full py-2 px-3 rounded-xl text-xs font-semibold btn-gradient text-white inline-flex items-center justify-center gap-1.5"
          >
            <span>Report in {selected.building}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
