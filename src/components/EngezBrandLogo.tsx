import React from 'react';
import { ThemeMode } from '../types';

interface EngezBrandLogoProps {
  theme: ThemeMode;
  collapsed?: boolean;
  onClickRefresh?: () => void;
}

export const EngezBrandLogo: React.FC<EngezBrandLogoProps> = ({
  theme,
  collapsed = false,
  onClickRefresh,
}) => {
  const isLight = theme === 'warm';
  const strokeColor = isLight ? '#2C3A47' : '#F8FAFC';

  const handleRefresh = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onClickRefresh) {
      onClickRefresh();
    } else {
      window.location.reload();
    }
  };

  return (
    <a
      href="/"
      onClick={handleRefresh}
      title="Click to refresh Explic"
      aria-label="Explic Logo — Click to refresh website"
      className="inline-flex items-center gap-2.5 select-none cursor-pointer group focus:outline-none"
    >
      {collapsed ? (
        <div
          className={`flex items-center justify-center w-10 h-10 rounded-xl border transition-transform group-hover:scale-105 ${
            isLight
              ? 'bg-white border-[#E2E8F0] text-[#2C3A47]'
              : 'bg-[#111827] border-white/15 text-[#F8FAFC]'
          }`}
        >
          <svg
            viewBox="0 0 60 60"
            className="w-6 h-6"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Custom stylized E from EXPLiC logo */}
            <path
              d="M46 12H14V48H46"
              stroke={strokeColor}
              strokeWidth="4.5"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
            <path
              d="M14 30H25L30 33.5L35 30H44"
              stroke={strokeColor}
              strokeWidth="4.2"
              strokeLinecap="butt"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <div className="flex items-center transition-opacity group-hover:opacity-85">
          {/* Exact vector recreation of the uploaded EXPLiC wordmark logo (compact size) */}
          <svg
            viewBox="0 0 330 72"
            className="h-5 sm:h-6 w-auto"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            aria-label="EXPLiC"
          >
            {/* E with signature dipped center bar */}
            <path
              d="M52 14H14V58H52"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
              strokeLinejoin="miter"
            />
            <path
              d="M14 35.5H27.5L33 39L38.5 35.5H49"
              stroke={strokeColor}
              strokeWidth="4.8"
              strokeLinecap="butt"
              strokeLinejoin="round"
            />

            {/* X */}
            <path
              d="M68 14L108 58M108 14L68 58"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
            />

            {/* P with signature curved open bowl */}
            <path
              d="M126 58V14H147C157.5 14 164 20 164 28C164 36 157.5 42 147 42H138C134 42 131.5 43.5 130.5 46"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
              strokeLinejoin="round"
            />

            {/* L with signature curved base */}
            <path
              d="M182 14V45C182 52 197 58 206 58C210.5 58 214.5 56.8 217 55"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
              strokeLinejoin="round"
            />

            {/* i with circular dot above stem */}
            <circle cx="233" cy="14" r="4.2" fill={strokeColor} />
            <path
              d="M233 25V58"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
            />

            {/* C */}
            <path
              d="M294 21.5C289 16.5 282 13.8 274 13.8C258.5 13.8 247 23.5 247 36C247 48.5 258.5 58.2 274 58.2C282.5 58.2 289.5 55.2 294.5 49.8"
              stroke={strokeColor}
              strokeWidth="5"
              strokeLinecap="butt"
            />
          </svg>
        </div>
      )}
    </a>
  );
};
