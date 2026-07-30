import Link from "next/link";
import { getCurrentFamily } from "./actions";
import { FamilyForm } from "./family-form";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const family = await getCurrentFamily();
  return (
    <div className="flex-1 bg-zinc-50 dark:bg-black">
      <main className="mx-auto max-w-md p-5">
        <Link href="/" className="text-sm text-zinc-500 dark:text-zinc-400">← 홈으로</Link>
        <h1 className="mt-5 text-2xl font-bold text-zinc-900 dark:text-zinc-50">가족 공간</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">같은 가족 공간에 참여한 사람끼리 청소·생필품·감정카드를 함께 사용합니다.</p>
        {family ? (
          <div className="mt-6 rounded-2xl bg-orange-50 p-5 dark:bg-orange-950/40">
            <p className="text-sm text-orange-800 dark:text-orange-200">가족 초대코드</p>
            <p className="mt-2 text-3xl font-black tracking-[0.25em] text-orange-700 dark:text-orange-300">{family.inviteCode}</p>
            <p className="mt-3 text-sm text-orange-800 dark:text-orange-200">이 코드를 가족에게 알려주면 같은 공간에 참여할 수 있습니다.</p>
          </div>
        ) : <div className="mt-6"><FamilyForm /></div>}
      </main>
    </div>
  );
}
