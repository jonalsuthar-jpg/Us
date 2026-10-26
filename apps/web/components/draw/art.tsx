/** Little drawings for tiles and empty states, in the same 300 × 400 shape as the board. */

export function CoupleDoodle({ className, stroke = 7 }: { className?: string; stroke?: number }) {
  return (
    <svg viewBox="0 0 300 400" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="236" cy="72" r="24" stroke="#F3A823" strokeWidth={stroke} />
      <circle cx="112" cy="196" r="17" stroke="#E2336A" strokeWidth={stroke} />
      <path d="M112 213 V268 M112 268 L96 302 M112 268 L128 302 M112 232 L150 246" stroke="#E2336A" strokeWidth={stroke} />
      <circle cx="188" cy="196" r="17" stroke="#0A776D" strokeWidth={stroke} />
      <path d="M188 213 V268 M188 268 L172 302 M188 268 L204 302 M188 232 L150 246" stroke="#0A776D" strokeWidth={stroke} />
      <path
        d="M150 168 C132 154 126 140 136 132 C143 127 149 131 150 137 C151 131 157 127 164 132 C174 140 168 154 150 168 Z"
        stroke="#F5547C"
        strokeWidth={stroke - 2}
        fill="#FFB8C9"
      />
    </svg>
  );
}

export function ChaiDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 400" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M90 170 h120 v70 a60 60 0 0 1 -120 0 Z M210 190 c40 0 40 40 0 40" stroke="#563805" strokeWidth={8} />
      <path d="M120 150 c-10 -20 10 -30 0 -50 M150 150 c-10 -20 10 -30 0 -50 M180 150 c-10 -20 10 -30 0 -50" stroke="#7A5E9A" strokeWidth={7} />
    </svg>
  );
}
