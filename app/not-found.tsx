import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-20">
      <div className="seed-card max-w-md p-8 text-center shadow-none">
        <p className="text-[13px] font-semibold text-fg-brand">404</p>
        <h1 className="mt-2 text-[22px] font-extrabold text-ink">페이지를 찾을 수 없어요</h1>
        <p className="mt-2 text-[14px] text-ink-muted">주소가 바뀌었거나 삭제된 페이지예요.</p>
        <Link href="/finance" className="seed-button seed-button-primary mt-6 inline-flex min-h-11 items-center px-5 py-2 text-[14px]">
          가계부로 돌아가기
        </Link>
      </div>
    </main>
  );
}
