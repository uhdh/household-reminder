import Link from "next/link";

/** 로그인 없이 실제 화면(샘플 가구 데이터)을 읽기 전용으로 보여주는 데모 모드 상단 배너. */
export function DemoBanner() {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-r3 border border-stroke-brand-weak bg-bg-brand-weak px-4 py-2.5 text-[13px]">
      <span className="font-bold text-fg-brand">로그인 없이 둘러보기</span>
      <span className="text-ink-muted">샘플 데이터이며, 로그인하면 내 데이터로 전환됩니다.</span>
      <Link href="/login" className="font-semibold text-fg-brand hover:underline">
        로그인
      </Link>
    </div>
  );
}
