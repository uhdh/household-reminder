import { getDb } from "@/lib/db";
import { budgetCategories, categoryMappings } from "@/lib/finance-db";
import { formatKRW } from "@/lib/finance-format";
import { getActiveTransactions, toNum } from "@/lib/spending-queries";
import {
  addBudgetCategoryAction,
  deleteBudgetCategoryAction,
  deleteCategoryMappingAction,
  updateBudgetCategoriesAction,
  upsertCategoryMappingAction,
} from "./actions";

export const dynamic = "force-dynamic";

const TXN_TYPES = ["수입", "지출", "이체"];
const KINDS = ["고정비", "변동비", "고정수입", "변동수입"];

function groupByKind(options: { name: string; kind: string }[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const o of options) {
    if (!groups[o.kind]) groups[o.kind] = [];
    groups[o.kind].push(o.name);
  }
  return groups;
}

/** 대분류/소분류 텍스트가 이미 표준카테고리 이름과 같으면 그걸 기본값으로 추천하고, 아니면 "기타"로 추천한다. */
function guessStdCategory(rawCategory: string, rawSubcategory: string, knownNames: Set<string>): string {
  if (knownNames.has(rawSubcategory)) return rawSubcategory;
  if (knownNames.has(rawCategory)) return rawCategory;
  return knownNames.has("기타") ? "기타" : (knownNames.values().next().value ?? "기타");
}

export default async function SettingsPage() {
  const db = getDb();
  const [mappings, budgets, { transactions: allTx }] = await Promise.all([
    db.select().from(categoryMappings),
    db.select().from(budgetCategories),
    getActiveTransactions(),
  ]);

  const sortedBudgets = [...budgets].sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder));
  const categoryOptions = sortedBudgets.map((b) => ({ name: b.name, kind: b.kind }));
  const knownNames = new Set(sortedBudgets.map((b) => b.name));

  // 실제 수입/지출 집계에 반영되는(included=true) 거래만 대상으로 해서, 어차피
  // 자기계좌이체 등으로 제외되는 항목까지 매핑하느라 힘 빼지 않도록 한다.
  const unmappedAgg = new Map<
    string,
    { txnType: string; rawCategory: string; rawSubcategory: string; count: number; totalAmount: number }
  >();
  for (const t of allTx) {
    if (t.stdCategory || !t.included) continue;
    const rawCategory = t.category ?? "미분류";
    const rawSubcategory = t.subcategory ?? "미분류";
    const key = `${t.txnType}|${rawCategory}|${rawSubcategory}`;
    const entry = unmappedAgg.get(key) ?? {
      txnType: t.txnType,
      rawCategory,
      rawSubcategory,
      count: 0,
      totalAmount: 0,
    };
    entry.count += 1;
    entry.totalAmount += Math.abs(toNum(t.amount));
    unmappedAgg.set(key, entry);
  }
  const unmapped = Array.from(unmappedAgg.values()).sort((a, b) => b.totalAmount - a.totalAmount);

  const sortedMappings = [...mappings].sort((a, b) =>
    a.txnType === b.txnType ? a.rawCategory.localeCompare(b.rawCategory, "ko") : a.txnType.localeCompare(b.txnType, "ko")
  );

  return (
    <div className="space-y-6">
      {unmapped.length > 0 && (
        <div className="border-[0.8px] border-gain/30 bg-gain/10 p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-gain">매핑되지 않은 카테고리 ({unmapped.length}건)</h2>
          <p className="mb-3 text-[12px] text-ink-muted">
            실제 수입/지출 집계에 반영되는 거래만 모았고, 금액이 큰 순서로 정렬했습니다. 목록에서 카테고리를
            고르고 저장하면 되고, 잘 모르겠으면 일단 &quot;기타&quot;로 두었다가 나중에 바꿔도 됩니다.
          </p>
          <div className="space-y-2">
            {unmapped.map((u) => {
              const guess = guessStdCategory(u.rawCategory, u.rawSubcategory, knownNames);
              const grouped = groupByKind(categoryOptions);
              return (
                <form
                  key={`${u.txnType}|${u.rawCategory}|${u.rawSubcategory}`}
                  action={upsertCategoryMappingAction}
                  className="flex flex-wrap items-center gap-2 text-[12px]"
                >
                  <input type="hidden" name="txnType" value={u.txnType} />
                  <input type="hidden" name="rawCategory" value={u.rawCategory} />
                  <input type="hidden" name="rawSubcategory" value={u.rawSubcategory} />
                  <span className="border-[0.8px] border-hairline2 bg-card px-2 py-1 text-ink-muted">
                    {u.txnType} · {u.rawCategory} · {u.rawSubcategory}
                  </span>
                  <span className="text-ink-muted">
                    {u.count}건 · {formatKRW(u.totalAmount)}
                  </span>
                  <span className="text-ink-muted">→</span>
                  <select
                    name="stdCategory"
                    defaultValue={guess}
                    className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
                  >
                    {Object.entries(grouped).map(([kind, names]) => (
                      <optgroup key={kind} label={kind}>
                        {names.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button type="submit" className="bg-legend1 px-2 py-1 font-medium text-canvas hover:opacity-90">
                    저장
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-[0.8px] border-hairline bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">카테고리 매핑</h2>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                <th className="px-2 py-1.5 font-semibold">타입</th>
                <th className="px-2 py-1.5 font-semibold">대분류</th>
                <th className="px-2 py-1.5 font-semibold">소분류</th>
                <th className="px-2 py-1.5 font-semibold">표준카테고리</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {sortedMappings.map((m) => (
                <tr key={m.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                  <td className="px-2 py-1.5 text-ink-muted">{m.txnType}</td>
                  <td className="px-2 py-1.5 text-ink-muted">{m.rawCategory}</td>
                  <td className="px-2 py-1.5 text-ink-muted">{m.rawSubcategory}</td>
                  <td className="px-2 py-1.5">
                    <form action={upsertCategoryMappingAction} className="flex items-center gap-1">
                      <input type="hidden" name="txnType" value={m.txnType} />
                      <input type="hidden" name="rawCategory" value={m.rawCategory} />
                      <input type="hidden" name="rawSubcategory" value={m.rawSubcategory} />
                      <input
                        name="stdCategory"
                        defaultValue={m.stdCategory}
                        className="w-28 border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
                      />
                      <button type="submit" className="border-[0.8px] border-hairline2 px-2 py-1 text-ink-muted hover:text-ink">
                        저장
                      </button>
                    </form>
                  </td>
                  <td className="px-2 py-1.5">
                    <form action={deleteCategoryMappingAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="text-gain hover:underline">
                        삭제
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-2 text-[12px] font-semibold text-ink-muted">새 매핑 추가</h3>
        <form action={upsertCategoryMappingAction} className="flex flex-wrap items-center gap-2 text-[12px]">
          <select name="txnType" required className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none">
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            name="rawCategory"
            placeholder="대분류"
            required
            className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
          />
          <input
            name="rawSubcategory"
            placeholder="소분류 (기본: 미분류)"
            className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
          />
          <span className="text-ink-muted">→</span>
          <input
            name="stdCategory"
            placeholder="표준카테고리"
            required
            className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
          />
          <button type="submit" className="bg-legend1 px-3 py-1 font-medium text-canvas hover:opacity-90">
            추가
          </button>
        </form>
      </div>

      <div className="border-[0.8px] border-hairline bg-card p-4">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">카테고리 성격 · 월 예산</h2>
        <form action={updateBudgetCategoriesAction}>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                  <th className="px-2 py-1.5 font-semibold">카테고리</th>
                  <th className="px-2 py-1.5 font-semibold">성격</th>
                  <th className="px-2 py-1.5 text-right font-semibold">월 예산</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {sortedBudgets.map((b) => (
                  <tr key={b.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                    <td className="px-2 py-1.5 text-ink">{b.name}</td>
                    <td className="px-2 py-1.5">
                      <select
                        name={`kind:${b.name}`}
                        defaultValue={b.kind}
                        className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
                      >
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        name={`budget:${b.name}`}
                        defaultValue={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : ""}
                        className="w-28 border-[0.8px] border-hairline2 bg-card px-2 py-1 text-right outline-none"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="submit"
                        formAction={deleteBudgetCategoryAction}
                        name="name"
                        value={b.name}
                        className="text-gain hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="submit" className="bg-legend1 px-3 py-1.5 text-[12px] font-medium text-canvas hover:opacity-90">
            전체 저장
          </button>
        </form>

        <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink-muted">새 카테고리 추가</h3>
        <form action={addBudgetCategoryAction} className="flex flex-wrap items-center gap-2 text-[12px]">
          <input
            name="name"
            placeholder="카테고리명"
            required
            className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
          />
          <select name="kind" required className="border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            step={1000}
            name="monthlyBudget"
            placeholder="월 예산(선택)"
            className="w-32 border-[0.8px] border-hairline2 bg-card px-2 py-1 outline-none"
          />
          <button type="submit" className="bg-legend1 px-3 py-1 font-medium text-canvas hover:opacity-90">
            추가
          </button>
        </form>
      </div>
    </div>
  );
}
