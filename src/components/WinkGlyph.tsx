interface WinkGlyphProps {
  width?: number | string;
  height?: number | string;
  color?: string;
  className?: string;
  isWinking?: boolean;
}

export function WinkGlyph({
  width = 26,
  height = 11,
  color = "#ffffff",
  className = "",
  isWinking = false,
}: WinkGlyphProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="146 210 220 80"
      fill="none"
      className={`shrink-0 overflow-visible ${className}`}
    >
      <style>{`
        @keyframes winkEyeAnim {
          0% { transform: scaleY(1); }
          25% { transform: scaleY(0.08); }
          65% { transform: scaleY(1.15); }
          100% { transform: scaleY(1); }
        }
        @keyframes winkArcAnim {
          0% { transform: scale(1); }
          50% { transform: scale(1.14); }
          100% { transform: scale(1); }
        }
        @keyframes winkSparkleAnim {
          0% { transform: scale(1) rotate(0deg); opacity: 0.8; }
          50% { transform: scale(2.4) rotate(45deg); opacity: 1; filter: drop-shadow(0 0 10px #38bdf8); }
          100% { transform: scale(1) rotate(0deg); opacity: 0.8; }
        }
        .wink-eye-active {
          animation: winkEyeAnim 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: 166px 256px;
        }
        .wink-arc-active {
          animation: winkArcAnim 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: 276px 256px;
        }
        .wink-sparkle-active {
          animation: winkSparkleAnim 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform-origin: 350px 224px;
        }
      `}</style>

      {/* Sensor Eye Dot (Blinks when isWinking is active) */}
      <g className={isWinking ? "wink-eye-active" : ""}>
        <circle
          cx="166"
          cy="256"
          r="16"
          fill={color}
          fillOpacity={0.65}
        />
        <circle
          cx="166"
          cy="256"
          r="7"
          fill={color}
        />
      </g>

      {/* Wink Smile / Iris Arc */}
      <path
        d="M 226 250 C 248 276, 296 276, 326 248"
        stroke={color}
        strokeWidth="24"
        strokeLinecap="round"
        className={isWinking ? "wink-arc-active" : ""}
      />

      {/* Specular Gleam Sparkle */}
      <g className={isWinking ? "wink-sparkle-active" : ""}>
        <path
          d="M 350 212 Q 350 224 362 224 Q 350 224 350 236 Q 350 224 338 224 Q 350 224 350 212 Z"
          fill="#38bdf8"
        />
        <circle
          cx="350"
          cy="224"
          r="3"
          fill="#ffffff"
        />
      </g>
    </svg>
  );
}
