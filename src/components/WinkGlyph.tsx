interface WinkGlyphProps {
  width?: number | string;
  height?: number | string;
  color?: string;
  className?: string;
}

export function WinkGlyph({
  width = 26,
  height = 11,
  color = "#ffffff",
  className = "",
}: WinkGlyphProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="146 210 220 80"
      fill="none"
      className={`shrink-0 ${className}`}
    >
      {/* Sensor Eye Dot */}
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

      {/* Wink Smile / Iris Arc */}
      <path
        d="M 226 250 C 248 276, 296 276, 326 248"
        stroke={color}
        strokeWidth="24"
        strokeLinecap="round"
      />

      {/* Specular Gleam Sparkle */}
      <path
        d="M 350 212 Q 350 224 362 224 Q 350 224 350 236 Q 350 224 338 224 Q 350 224 350 212 Z"
        fill={color}
      />
      <circle
        cx="350"
        cy="224"
        r="4"
        fill={color}
      />
    </svg>
  );
}
