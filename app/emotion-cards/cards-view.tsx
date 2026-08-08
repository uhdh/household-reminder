"use client";

import { useState } from "react";
import type { Emotion } from "@/lib/emotions";
import { COLORS, DEFINITIONS } from "@/lib/emotions";

type Props = {
  label: string;
  cards: Emotion[];
};

export function CardsView({ label, cards }: Props) {
  const [expanded, setExpanded] = useState<Emotion | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-bold text-fg-neutral-muted">{label}</div>
      <div className="flex gap-2.5">
        {cards.map((card) => (
          <button
            key={card.name}
            type="button"
            onClick={() => setExpanded(card)}
            className="flex flex-1 flex-col items-center gap-2 rounded-2xl px-2 py-4"
            style={{ background: COLORS[card.color].bg, border: `1px solid ${COLORS[card.color].border}` }}
          >
            <div className="text-2xl">{card.emoji}</div>
            <div className="text-[13px] font-semibold" style={{ color: COLORS[card.color].text }}>
              {card.name}
            </div>
          </button>
        ))}
      </div>

      {expanded && (
        <div
          data-testid="card-overlay-backdrop"
          onClick={() => setExpanded(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-7 transition-opacity duration-200"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[300px] flex-col items-center gap-4 rounded-[28px] px-8 py-11 transition-all duration-200"
            style={{
              background: COLORS[expanded.color].bg,
              border: `1px solid ${COLORS[expanded.color].border}`,
              boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
            }}
          >
            <div className="text-[76px] leading-none">{expanded.emoji}</div>
            <div className="text-[22px] font-bold" style={{ color: COLORS[expanded.color].text }}>
              {expanded.name}
            </div>
            <div className="text-center text-sm leading-relaxed text-fg-neutral-muted">
              {DEFINITIONS[expanded.name] ?? ""}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
