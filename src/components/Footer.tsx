import { Link } from 'react-router-dom';
import { MitsLogo } from '@/src/components/MitsLogo';

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-[#05070D]/90 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-3.5">
          <MitsLogo size={34} />
          <div>
            <p className="font-display text-sm font-semibold text-white">
              CampusCare · MITS Gwalior
            </p>
            <p className="text-xs text-slate-400">
              Madhav Institute of Technology &amp; Science, Gwalior · Campus Maintenance Portal
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400">
          <Link to="/report" className="hover:text-white transition-colors">
            Report an Issue
          </Link>
          <Link to="/track" className="hover:text-white transition-colors">
            Track Ticket
          </Link>
          <Link to="/campus-3d" className="hover:text-white transition-colors">
            3D Campus Map
          </Link>
          <Link to="/login" className="hover:text-white transition-colors">
            Student Login
          </Link>
          <Link to="/admin/login" className="hover:text-cyan-300 transition-colors">
            Staff Portal
          </Link>
        </div>
      </div>
    </footer>
  );
}
