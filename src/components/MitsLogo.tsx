import { useState } from 'react';

interface MitsLogoProps {
  size?: number;
  className?: string;
}

export const OFFICIAL_MITS_LOGO_URL = '/assets/aistudio/newsite-logo1_e4e82ecd.png';

export function MitsLogo({ size = 32, className = '' }: MitsLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`rounded-xl bg-white/10 border border-white/15 flex items-center justify-center shrink-0 text-[10px] font-bold tracking-tight text-cyan-300 ${className}`}
        aria-label="MITS Gwalior Crest"
      >
        MITS
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-xl bg-white p-0.5 shadow-sm ring-1 ring-white/25 flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      <img
        src={OFFICIAL_MITS_LOGO_URL}
        alt="Madhav Institute of Technology & Science, Gwalior Logo"
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="w-full h-full object-contain scale-[1.12] -translate-x-[3%] -translate-y-[2%]"
      />
    </div>
  );
}
