import Link from "next/link";
import { getDb } from "@/lib/db";
import { budgetCategories, categoryKeywordRules, categoryMappings, categoryRules } from "@/lib/finance-db";
import { formatKRW } from "@/lib/finance-format";
import { getActiveTransactions, toNum } from "@/lib/spending-queries";
import { ActionButton, SelectInput, TextInput } from "@/components/ui";
import {
  addBudgetCategoryAction,
  deleteBudgetCategoryAction,
  deleteCategoryKeywordRuleAction,
  deleteCategoryMappingAction,
  deleteCategoryRuleAction,
  updateBudgetCategoriesAction,
  upsertCategoryKeywordRuleAction,
  upsertCategoryMappingAction,
  upsertCategoryRuleAction,
} from "./actions";
import { UploadForm } from "@/app/finance/upload/upload-form";

export const dynamic = "force-dynamic";

const TXN_TYPES = ["수입", "지출", "이체"];
const KINDS = ["고정비", "변동비", "고정수입", "변동수입"];
const SETTING_TABS = [
  { id: "upload", label: "파일 업로드" },
  { id: "mappings", label: "카테고리 매핑" },
  { id: "rules", label: "사용자 규칙" },
  { id: "categories", label: "카테고리 · 예산" },
  { id: "unmapped", label: "미분류 관리" },
] as const;

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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; error?: string; success?: string }> }) {
  const { tab, error, success } = await searchParams;
  const activeTab = SETTING_TABS.some((item) => item.id === tab) ? tab! : "upload";
  const db = getDb();
  const [mappings, rules, keywordRules, budgets, { transactions: allTx }] = await Promise.all([
    db.select().from(categoryMappings),
    db.select().from(categoryRules),
    db.select().from(categoryKeywordRules),
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
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10">
      <nav className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] lg:flex-col [&::-webkit-scrollbar]:hidden" aria-label="설정 메뉴">
        <h1 className="mb-4 hidden text-[28px] font-extrabold tracking-[-0.02em] text-ink lg:block">설정</h1>
        {SETTING_TABS.map((item) => (
          <Link
            key={item.id}
            href={`/finance/spending/settings?tab=${item.id}`}
            aria-current={activeTab === item.id ? "page" : undefined}
            className={`flex h-11 shrink-0 items-center rounded-r3 px-4 text-[15px] transition-colors ${
              activeTab === item.id ? "bg-bg-neutral-weak font-bold text-ink" : "font-medium text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">

      {activeTab === "upload" && <UploadForm error={error} success={success} />}

      {activeTab === "unmapped" && (unmapped.length > 0 ? (
        <div className="seed-card bg-bg-critical-weak p-4">
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
                  <SelectInput
                    name="stdCategory"
                    defaultValue={guess}
                    className="min-h-9 w-auto px-2 py-1"
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
                  </SelectInput>
                  <ActionButton type="submit" className="min-h-9 px-3 py-1">
                    저장
                  </ActionButton>
                </form>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="seed-card p-5 sm:p-7 text-[13px] text-ink-muted">현재 관리할 미분류 항목이 없습니다.</div>
      ))}

      {activeTab === "mappings" && <div className="seed-card p-5 sm:p-7">
        <h2 className="mb-3 text-[18px] font-extrabold text-ink">카테고리 매핑</h2>
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                <th className="px-3 py-3 font-semibold">타입</th>
                <th className="px-3 py-3 font-semibold">대분류</th>
                <th className="px-3 py-3 font-semibold">소분류</th>
                <th className="px-3 py-3 font-semibold">표준카테고리</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedMappings.map((m) => (
                <tr key={m.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                  <td className="px-3 py-3 text-ink-muted">{m.txnType}</td>
                  <td className="px-3 py-3 text-ink-muted">{m.rawCategory}</td>
                  <td className="px-3 py-3 text-ink-muted">{m.rawSubcategory}</td>
                  <td className="px-3 py-3">
                    <form action={upsertCategoryMappingAction} className="flex items-center gap-1">
                      <input type="hidden" name="txnType" value={m.txnType} />
                      <input type="hidden" name="rawCategory" value={m.rawCategory} />
                      <input type="hidden" name="rawSubcategory" value={m.rawSubcategory} />
                      <TextInput
                        name="stdCategory"
                        defaultValue={m.stdCategory}
                        className="min-h-9 w-28 px-2 py-1"
                      />
                      <ActionButton type="submit" variant="secondary" className="min-h-9 px-2 py-1">
                        저장
                      </ActionButton>
                    </form>
                  </td>
                  <td className="px-3 py-3">
                    <form action={deleteCategoryMappingAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <ActionButton type="submit" variant="ghost" className="min-h-9 px-2 py-1 text-fg-critical">
                        삭제
                      </ActionButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mb-2 text-[12px] font-semibold text-ink-muted">새 매핑 추가</h3>
        <form action={upsertCategoryMappingAction} className="flex flex-wrap items-center gap-2 text-[12px]">
          <SelectInput name="txnType" required className="min-h-9 w-auto px-2 py-1">
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectInput>
          <TextInput
            name="rawCategory"
            placeholder="대분류"
            required
            className="min-h-9 w-auto px-2 py-1"
          />
          <TextInput
            name="rawSubcategory"
            placeholder="소분류 (기본: 미분류)"
            className="min-h-9 w-auto px-2 py-1"
          />
          <span className="text-ink-muted">→</span>
          <TextInput
            name="stdCategory"
            placeholder="표준카테고리"
            required
            className="min-h-9 w-auto px-2 py-1"
          />
          <ActionButton type="submit" className="min-h-9 px-3 py-1">
            추가
          </ActionButton>
        </form>
      </div>}

      {activeTab === "rules" && <div className="space-y-6">
        <div className="seed-card p-5 sm:p-7">
          <h2 className="mb-1 text-[18px] font-extrabold text-ink">가맹점 · 적요 키워드 규칙</h2>
          <p className="mb-3 text-[12px] text-ink-muted">내용(가맹점명·적요)에 특정 키워드가 포함된 거래를 해당 카테고리로 자동 분류합니다.</p>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                  <th className="px-3 py-3 font-semibold">구분</th>
                  <th className="px-3 py-3 font-semibold">키워드</th>
                  <th className="px-3 py-3 font-semibold">적용 카테고리</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {keywordRules.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-center text-ink-muted">
                      등록된 키워드 규칙이 없습니다. 세부 내역에서 카테고리를 수정할 때 바로 규칙으로 등록할 수 있습니다.
                    </td>
                  </tr>
                ) : (
                  keywordRules.map((rule) => (
                    <tr key={rule.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                      <td className="px-3 py-3 text-ink-muted">{rule.txnType}</td>
                      <td className="px-3 py-3 font-semibold text-ink">{rule.keyword}</td>
                      <td className="px-3 py-3 text-ink">{rule.stdCategory}</td>
                      <td className="px-3 py-3">
                        <form action={deleteCategoryKeywordRuleAction}>
                          <input type="hidden" name="id" value={rule.id} />
                          <ActionButton type="submit" variant="ghost" className="min-h-9 px-2 py-1 text-fg-critical">삭제</ActionButton>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <h3 className="mb-2 text-[12px] font-semibold text-ink-muted">새 키워드 규칙 추가</h3>
          <form action={upsertCategoryKeywordRuleAction} className="flex flex-wrap items-center gap-2 text-[12px]">
            <SelectInput name="txnType" required defaultValue="지출" className="min-h-9 w-auto px-2 py-1">
              <option value="전체">전체</option>
              {TXN_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </SelectInput>
            <TextInput name="keyword" placeholder="키워드 (예: 코스트코, 이니시스)" required className="min-h-9 w-auto px-2 py-1" />
            <span className="text-ink-muted">→</span>
            <SelectInput name="stdCategory" required className="min-h-9 w-auto px-2 py-1">
              {Object.entries(groupByKind(categoryOptions)).map(([kind, names]) => (
                <optgroup key={kind} label={kind}>
                  {names.map((name) => <option key={name} value={name}>{name}</option>)}
                </optgroup>
              ))}
            </SelectInput>
            <label className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
              <input type="checkbox" name="applyToExisting" value="true" defaultChecked className="size-3.5 rounded border-hairline" />
              기존 내역 일괄 반영
            </label>
            <ActionButton type="submit" className="min-h-9 px-3 py-1">추가</ActionButton>
          </form>
        </div>

        <div className="seed-card p-5 sm:p-7">
          <h2 className="mb-1 text-[18px] font-extrabold text-ink">결제수단 규칙</h2>
          <p className="mb-3 text-[12px] text-ink-muted">결제수단/계좌가 정확히 일치하는 거래에 카테고리를 우선 적용합니다.</p>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                  <th className="px-3 py-3 font-semibold">구분</th>
                  <th className="px-3 py-3 font-semibold">결제수단/계좌</th>
                  <th className="px-3 py-3 font-semibold">적용 카테고리</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                    <td className="px-3 py-3 text-ink-muted">{rule.txnType}</td>
                    <td className="px-3 py-3 text-ink-muted">{rule.paymentMethod}</td>
                    <td className="px-3 py-3 text-ink">{rule.stdCategory}</td>
                    <td className="px-3 py-3">
                      <form action={deleteCategoryRuleAction}>
                        <input type="hidden" name="id" value={rule.id} />
                        <ActionButton type="submit" variant="ghost" className="min-h-9 px-2 py-1 text-fg-critical">삭제</ActionButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mb-2 text-[12px] font-semibold text-ink-muted">새 결제수단 규칙 추가</h3>
          <form action={upsertCategoryRuleAction} className="flex flex-wrap items-center gap-2 text-[12px]">
            <SelectInput name="txnType" required defaultValue="지출" className="min-h-9 w-auto px-2 py-1">
              {TXN_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </SelectInput>
            <TextInput name="paymentMethod" placeholder="결제수단/계좌" required className="min-h-9 w-auto px-2 py-1" />
            <span className="text-ink-muted">→</span>
            <SelectInput name="stdCategory" required className="min-h-9 w-auto px-2 py-1">
              {Object.entries(groupByKind(categoryOptions)).map(([kind, names]) => (
                <optgroup key={kind} label={kind}>
                  {names.map((name) => <option key={name} value={name}>{name}</option>)}
                </optgroup>
              ))}
            </SelectInput>
            <ActionButton type="submit" className="min-h-9 px-3 py-1">추가</ActionButton>
          </form>
        </div>
      </div>}

      {activeTab === "categories" && <div className="seed-card p-5 sm:p-7">
        <h2 className="mb-3 text-[18px] font-extrabold text-ink">카테고리 성격 · 월 예산</h2>
        <form action={updateBudgetCategoriesAction}>
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b-[0.8px] border-hairline text-left text-ink-muted">
                  <th className="px-3 py-3 font-semibold">카테고리</th>
                  <th className="px-3 py-3 font-semibold">성격</th>
                  <th className="px-3 py-3 text-right font-semibold">월 예산</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedBudgets.map((b) => (
                  <tr key={b.id} className="border-b-[0.8px] border-hairline2 last:border-0">
                    <td className="px-3 py-3 text-ink">{b.name}</td>
                    <td className="px-3 py-3">
                      <SelectInput
                        name={`kind:${b.name}`}
                        defaultValue={b.kind}
                        className="min-h-9 w-auto px-2 py-1"
                      >
                        {KINDS.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </SelectInput>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <TextInput
                        type="number"
                        min={0}
                        step={1000}
                        name={`budget:${b.name}`}
                        defaultValue={b.monthlyBudget !== null ? toNum(b.monthlyBudget) : ""}
                        className="min-h-9 w-28 px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ActionButton
                        variant="ghost"
                        type="submit"
                        formAction={deleteBudgetCategoryAction.bind(null, b.name)}
                        className="min-h-9 px-2 py-1 text-fg-critical"
                      >
                        삭제
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionButton type="submit" className="min-h-9 px-3 py-1.5 text-[12px]">
            전체 저장
          </ActionButton>
        </form>

        <h3 className="mb-2 mt-5 text-[12px] font-semibold text-ink-muted">새 카테고리 추가</h3>
        <form action={addBudgetCategoryAction} className="flex flex-wrap items-center gap-2 text-[12px]">
          <TextInput
            name="name"
            placeholder="카테고리명"
            required
            className="min-h-9 w-auto px-2 py-1"
          />
          <SelectInput name="kind" required className="min-h-9 w-auto px-2 py-1">
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </SelectInput>
          <TextInput
            type="number"
            min={0}
            step={1000}
            name="monthlyBudget"
            placeholder="월 예산(선택)"
            className="min-h-9 w-32 px-2 py-1"
          />
          <ActionButton type="submit" className="min-h-9 px-3 py-1">
            추가
          </ActionButton>
        </form>
      </div>}
      </div>
    </div>
  );
}
