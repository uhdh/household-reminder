import { setTransactionPrivateAction } from "./actions";

export function PrivateToggle({ txnId, isPrivate, returnTo }: { txnId: string; isPrivate: boolean; returnTo: string }) {
  return (
    <form action={setTransactionPrivateAction}>
      <input type="hidden" name="txnId" value={txnId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="private" value={isPrivate ? "0" : "1"} />
      <button
        type="submit"
        title={isPrivate ? "파트너에게도 내용을 보여줘요" : "파트너에게 내용을 숨겨요(합계에는 포함돼요)"}
        className="inline-flex min-h-9 items-center rounded-r2 px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-bg-neutral-weak focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg-brand"
      >
        {isPrivate ? "공개로" : "나만 보기"}
      </button>
    </form>
  );
}
