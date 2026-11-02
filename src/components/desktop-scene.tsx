import { useEffect, useRef } from 'react';
import { SQUIRCLE_POINTS } from '@/lib/squircle';

// A made-up 1920 × 1080 desktop that stands in for a screen share in the camera
// preview: a browser with a chart, a code editor and a moving pointer. Fixed
// colours, so it looks like a desktop whatever the app theme.

const CHART_BARS = [0.45, 0.7, 0.55, 0.85, 0.6, 0.95, 0.75];
const CODE_LINES: [indent: number, width: number, colour: string][] = [
  [0, 220, '#c678dd'],
  [1, 340, '#61afef'],
  [2, 280, '#98c379'],
  [2, 410, '#e5c07b'],
  [1, 120, '#abb2bf'],
  [0, 0, ''],
  [0, 260, '#c678dd'],
  [1, 380, '#61afef'],
  [2, 300, '#98c379'],
  [2, 190, '#d19a66'],
  [1, 140, '#abb2bf'],
];
const DOCK_COLOURS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];
const DOCK_ICON = 56;

/** An SVG path for a squircle filling a `size` square at (x, y), the same outline the camera overlay uses. */
function squirclePath(x: number, y: number, size: number): string {
  const r = size / 2;
  return `${SQUIRCLE_POINTS.map(([px, py], i) => `${i ? 'L' : 'M'}${(x + r + px * r).toFixed(1)} ${(y + r + py * r).toFixed(1)}`).join(' ')} Z`;
}

export function DesktopScene({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null);
  // SMIL ignores prefers-reduced-motion, so pause it by hand.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) svg.current?.pauseAnimations();
  }, []);

  return (
    <svg
      ref={svg}
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wallpaper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#312e81" />
          <stop offset="0.55" stopColor="#7c3aed" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="80" />
        </filter>
        <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="18" stdDeviation="22" floodColor="#000" floodOpacity="0.35" />
        </filter>
        <clipPath id="browser-clip">
          <rect width="1100" height="700" rx="14" />
        </clipPath>
        <clipPath id="editor-clip">
          <rect width="760" height="520" rx="14" />
        </clipPath>
      </defs>

      {/* Wallpaper with two slowly drifting glows */}
      <rect width="1920" height="1080" fill="url(#wallpaper)" />
      <circle cx="420" cy="860" r="320" fill="#ec4899" opacity="0.45" filter="url(#soft)">
        <animate attributeName="cx" values="420;620;420" dur="18s" repeatCount="indefinite" />
      </circle>
      <circle cx="1500" cy="220" r="280" fill="#38bdf8" opacity="0.35" filter="url(#soft)">
        <animate attributeName="cy" values="220;380;220" dur="22s" repeatCount="indefinite" />
      </circle>

      {/* Menu bar */}
      <rect width="1920" height="36" fill="#ffffff" opacity="0.18" />
      <circle cx="30" cy="18" r="8" fill="#fff" opacity="0.9" />
      {[70, 150, 220, 290].map((x, i) => (
        <rect key={x} x={x} y="12" width={i === 0 ? 60 : 50} height="12" rx="6" fill="#fff" opacity={i === 0 ? 0.9 : 0.6} />
      ))}
      <text x="1890" y="24" textAnchor="end" fill="#fff" fontSize="16" fontFamily="system-ui, sans-serif" opacity="0.9">
        Mon 9:41
      </text>

      {/* Browser window */}
      <g transform="translate(150 100)" filter="url(#shadow)">
        <g clipPath="url(#browser-clip)">
          <rect width="1100" height="700" fill="#ffffff" />
          <rect width="1100" height="52" fill="#f1f5f9" />
          <circle cx="26" cy="26" r="7" fill="#ef4444" />
          <circle cx="50" cy="26" r="7" fill="#f59e0b" />
          <circle cx="74" cy="26" r="7" fill="#22c55e" />
          <rect x="260" y="13" width="580" height="26" rx="13" fill="#e2e8f0" />
          <rect x="290" y="22" width="200" height="8" rx="4" fill="#94a3b8" />

          <rect x="48" y="96" width="360" height="26" rx="6" fill="#0f172a" />
          <rect x="48" y="138" width="520" height="12" rx="6" fill="#cbd5e1" />
          <rect x="48" y="160" width="440" height="12" rx="6" fill="#cbd5e1" />

          {/* Stat tiles */}
          {['#eef2ff', '#ecfdf5', '#fff7ed'].map((fill, i) => (
            <g key={fill} transform={`translate(${48 + i * 340} 200)`}>
              <rect width="316" height="110" rx="12" fill={fill} />
              <rect x="22" y="24" width="110" height="10" rx="5" fill="#94a3b8" />
              <rect x="22" y="54" width={140 + i * 30} height="28" rx="6" fill="#1e293b" />
            </g>
          ))}

          {/* Bar chart that keeps updating */}
          <rect x="48" y="336" width="1004" height="320" rx="12" fill="#f8fafc" />
          {CHART_BARS.map((h, i) => {
            const max = 240;
            const base = 630;
            const heights = [h, Math.min(1, h + 0.2), Math.max(0.2, h - 0.15), h].map((v) => v * max);
            return (
              <rect key={i} x={110 + i * 132} width="72" rx="8" fill={i === 5 ? '#7c3aed' : '#a5b4fc'}>
                <animate
                  attributeName="height"
                  values={heights.join(';')}
                  dur="6s"
                  begin={`${i * 0.2}s`}
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="y"
                  values={heights.map((v) => base - v).join(';')}
                  dur="6s"
                  begin={`${i * 0.2}s`}
                  repeatCount="indefinite"
                />
              </rect>
            );
          })}
        </g>
      </g>

      {/* Code editor window */}
      <g transform="translate(1010 320)" filter="url(#shadow)">
        <g clipPath="url(#editor-clip)">
          <rect width="760" height="520" fill="#1e2127" />
          <rect width="760" height="44" fill="#16181d" />
          <circle cx="24" cy="22" r="7" fill="#ef4444" />
          <circle cx="48" cy="22" r="7" fill="#f59e0b" />
          <circle cx="72" cy="22" r="7" fill="#22c55e" />
          <rect x="110" y="14" width="140" height="30" rx="6" fill="#1e2127" />
          <rect x="0" y="44" width="56" height="476" fill="#1a1c21" />
          {CODE_LINES.map(([indent, width, colour], i) => (
            <g key={i}>
              <rect x="20" y={70 + i * 36} width="20" height="10" rx="3" fill="#4b5263" />
              {width > 0 && (
                <rect x={80 + indent * 36} y={66 + i * 36} width={width} height="16" rx="5" fill={colour} opacity="0.85" />
              )}
            </g>
          ))}
          {/* A line being typed, with a blinking caret */}
          <rect x="116" y={66 + CODE_LINES.length * 36} height="16" rx="5" fill="#56b6c2" opacity="0.85">
            <animate attributeName="width" values="0;360;360;0" keyTimes="0;0.6;0.9;1" dur="5s" repeatCount="indefinite" />
          </rect>
          <rect y={62 + CODE_LINES.length * 36} width="3" height="24" fill="#e5e7eb">
            <animate attributeName="x" values="116;478;478;116" keyTimes="0;0.6;0.9;1" dur="5s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
          </rect>
        </g>
      </g>

      {/* Dock */}
      <rect x="700" y="990" width="520" height="74" rx="22" fill="#ffffff" opacity="0.22" />
      {DOCK_COLOURS.map((fill, i) => (
        <path key={fill} d={squirclePath(727 + i * 82, 999, DOCK_ICON)} fill={fill} />
      ))}

      {/* Pointer gliding between the windows */}
      <g>
        <animateMotion
          dur="9s"
          repeatCount="indefinite"
          path="M 520 520 C 760 380, 980 420, 1180 520 S 1500 700, 1340 800 S 820 760, 640 640 Z"
        />
        <path d="M0 0 L0 34 L9 26 L16 42 L22 39 L15 24 L27 24 Z" fill="#0f172a" stroke="#fff" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
