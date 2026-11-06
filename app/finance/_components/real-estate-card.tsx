"use client";

import { useState, useTransition } from "react";
import { formatManwon } from "@/lib/finance-format";
import { deleteRealAssetAction, saveRealAssetAction } from "../real-estate-actions";

type Debt = { key: string; name: string; personLabel: string; amount: number };
type Asset = { id: string; name: string; value: number; loanKeys: string[] };

/** 부동산은 금액이 커서 금융자산 그래프와 따로 둔다: 시세·묶인 대출·내 몫·대출 비율. */
export function RealEstateCard({
  assets,
  bankItems,
  debts,
  linkedKeys,
  summary,
  readOnly,
}: {
  assets: Asset[];
  bankItems: { name: string; value: number }[];
  debts: Debt[];
  linkedKeys: string[];
  summary: { value: number; loan: number; equity: number; ltvPct: number | null };
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const linkedDebts = debts.filter((d) => linkedKeys.includes(d.key));
  if (readOnly && assets.length === 0 && bankItems.length === 0) return null;

  return (
    <section className="seed-card mt-3 p-5 shadow-none sm:p-7" aria-labelledby="real-estate-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="real-estate-heading" className="text-[18px] font-extrabold text-ink">부동산</h2>
          <span className="text-[13px] text-ink-muted">금액이 커서 위 그래프와 따로 보여줘요. 순자산 카드의 &apos;부동산 포함&apos;에 더해져요.</span>
        </div>
        {!readOnly && editing === null && (
          <button type="button" onClick={() => setEditing("new")} className="rounded-r2 bg-bg-neutral-weak px-3 py-1.5 text-[13px] font-semibold text-ink">
            + 부동산 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "시세", value: formatManwon(summary.value), strong: false },
          { label: "묶인 대출", value: formatManwon(summary.loan), strong: false },
          { label: "내 몫", value: formatManwon(summary.equity), strong: true },
          { label: "대출 비율(LTV)", value: summary.ltvPct === null ? "-" : `${summary.ltvPct.toFixed(0)}%`, strong: false },
        ].map((x) => (
          <div key={x.label} className="rounded-r3 bg-bg-neutral-weak px-4 py-3">
            <p className="text-[12px] text-ink-muted">{x.label}</p>
            <p className={`mt-0.5 tabular-nums text-ink ${x.strong ? "text-[20px] font-extrabold" : "text-[16px] font-bold"}`}>{x.value}</p>
          </div>
        ))}
      </div>
      {summary.ltvPct !== null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-neutral-weak" aria-hidden>
          <div className="h-full rounded-full bg-[#f2783c]" style={{ width: `${Math.min(100, summary.ltvPct)}%` }} />
        </div>
      )}

      <ul className="mt-4 divide-y divide-hairline2 text-[14px]">
        {assets.map((a) =>
          editing === a.id ? (
            <li key={a.id} className="py-3">
              <AssetForm asset={a} debts={debts} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={a.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{a.name}</p>
                <p className="text-[12px] text-ink-muted">
                  {a.loanKeys.length ? `대출: ${debts.filter((d) => a.loanKeys.includes(d.key)).map((d) => d.name).join(", ") || "-"}` : "묶인 대출 없음"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="font-bold tabular-nums text-ink">{formatManwon(a.value)}</span>
                {!readOnly && (
                  <button type="button" onClick={() => setEditing(a.id)} className="text-[12px] font-semibold text-ink-muted hover:text-ink">
                    수정
                  </button>
                )}
              </div>
            </li>
          )
        )}
        {bankItems.map((b, i) => (
          <li key={`bank-${i}`} className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0 truncate text-ink">
              {b.name} <span className="text-[12px] text-ink-muted">뱅크샐러드</span>
            </span>
            <span className="font-bold tabular-nums text-ink">{formatManwon(b.value)}</span>
          </li>
        ))}
        {editing === "new" && (
          <li className="py-3">
            <AssetForm debts={debts} defaultLoanKeys={assets.length === 0 ? linkedKeys : []} onDone={() => setEditing(null)} />
          </li>
        )}
      </ul>

      {assets.length === 0 && bankItems.length === 0 && editing === null && (
        <p className="mt-1 text-[13px] text-ink-muted">
          {linkedDebts.length > 0
            ? `${linkedDebts.map((d) => d.name).join(", ")}(${formatManwon(summary.loan)})은 집에 묶인 대출로 보고 있어요. 집 시세를 넣으면 내 몫을 계산해요.`
            : "집이 있다면 시세를 넣어 보세요. 담보대출을 함께 고르면 내 몫과 대출 비율을 계산해요."}
        </p>
      )}
    </section>
  );
}

function AssetForm({ asset, debts, defaultLoanKeys = [], onDone }: { asset?: Asset; debts: Debt[]; defaultLoanKeys?: string[]; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const checked = new Set(asset?.loanKeys ?? defaultLoanKeys);
  return (
    <form
      action={(formData) =>
        start(async () => {
          const r = await saveRealAssetAction(formData);
          if (r.ok) onDone();
          else setError(r.error ?? "저장하지 못했어요.");
        })
      }
      className="flex flex-col gap-3 rounded-r3 bg-bg-neutral-weak p-4"
    >
      {asset && <input type="hidden" name="id" value={asset.id} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-[13px] font-semibold text-ink">
          이름
          <input name="name" required defaultValue={asset?.name ?? ""} placeholder="예: 우리집 아파트" className="seed-input mt-1.5 h-10 w-full px-3 text-[14px]" />
        </label>
        <label className="block text-[13px] font-semibold text-ink">
          시세 <span className="font-normal text-ink-muted">만원</span>
          <input name="valueMan" required inputMode="numeric" defaultValue={asset ? Math.round(asset.value / 10_000) : ""} placeholder="예: 80000" className="seed-input mt-1.5 h-10 w-full px-3 text-right text-[14px] tabular-nums" />
        </label>
      </div>
      {debts.length > 0 && (
        <fieldset>
          <legend className="text-[13px] font-semibold text-ink">이 집에 묶인 대출</legend>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {debts.map((d) => (
              <label key={d.key} className="flex items-center gap-2 text-[13px] text-ink">
                <input type="checkbox" name="loanKey" value={d.key} defaultChecked={checked.has(d.key)} />
                <span className="min-w-0 truncate">{d.name}</span>
                <span className="shrink-0 text-[12px] text-ink-muted">
                  {d.personLabel} · {formatManwon(d.amount)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && <p role="alert" className="text-[12px] text-fg-critical">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="rounded-r2 bg-bg-brand-solid px-4 py-2 text-[13px] font-bold text-static-white disabled:opacity-50">
          {pending ? "저장 중…" : "저장"}
        </button>
        <button type="button" onClick={onDone} className="px-3 py-2 text-[13px] font-semibold text-ink-muted hover:text-ink">
          취소
        </button>
        {asset && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`'${asset.name}'을(를) 지울까요?`)) start(async () => { await deleteRealAssetAction(asset.id); onDone(); });
            }}
            className="ml-auto px-3 py-2 text-[13px] font-semibold text-fg-critical"
          >
            삭제
          </button>
        )}
      </div>
    </form>
  );
}
