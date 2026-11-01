"use client";

import Link from "next/link";
import { IconReceiptLine } from "@karrotmarket/react-monochrome-icon";
import { useAppExperience } from "@/app/app-experience";

/**
 * 온보딩 직후처럼 가구 전체에 데이터가 하나도 없을 때 페이지 본문 대신 보여주는 공용 빈 상태.
 * 자산관리·월별·연간·세부 내역 페이지에서 공유한다.
 */
export function FinanceEmptyState({
  title = "아직 가계부 데이터가 없어요",
  description,
  primaryHref = "/finance/upload",
  primaryLabel = "엑셀 업로드하러 가기",
  secondaryHref,
  secondaryLabel,
}: {
  title?: string;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const isApp = useAppExperience();
  const appStart = isApp && primaryHref === "/finance/upload";
  const mainHref = appStart ? "/finance/spending?manual=1#manual-entry" : primaryHref;
  const mainLabel = appStart ? "첫 내역 입력하기" : primaryLabel;
  const otherHref = appStart ? "/finance/upload" : secondaryHref;
  const otherLabel = appStart ? "자료 가져오기" : secondaryLabel;
  return (
    <div className="seed-card flex flex-col items-center gap-3 p-10 text-center shadow-none">
      <IconReceiptLine size={36} className="text-ink-muted" aria-hidden="true" />
      <h2 className="text-[17px] font-extrabold text-ink">{title}</h2>
      <p className="max-w-sm text-[13px] leading-5 text-ink-muted">
        {description ?? (appStart
          ? "지출 한 건부터 직접 기록해보세요. 뱅크샐러드 자료는 휴대폰에서 가져오거나 PC에서 올릴 수도 있어요."
          : "뱅크샐러드에서 내보낸 엑셀 파일을 올리면 자산과 지출이 자동으로 정리돼요.")}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
        <Link href={mainHref} className="seed-button seed-button-primary px-5 py-2.5 text-[14px]">
          {mainLabel}
        </Link>
        {otherHref && otherLabel && (
          <Link href={otherHref} className="text-[13px] font-semibold text-fg-brand hover:underline">
            {otherLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

/** 가구 전체는 비어있지 않지만 조회 중인 기간(월/연)에만 기록이 없을 때 쓰는 짧은 안내. */
export function PeriodEmptyNote({ label }: { label: string }) {
  return (
    <div className="seed-card p-8 text-center shadow-none">
      <p className="text-[13px] text-ink-muted">{label}에는 기록이 없어요. 다른 기간을 확인해보세요.</p>
    </div>
  );
}
