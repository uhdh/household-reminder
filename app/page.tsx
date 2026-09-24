import { StartView } from "./start-view";

// The greeting date comes from new Date() at render time; without this the page
// is statically rendered once at build and the date freezes. NOTE: `revalidate`
// is the pre-Cache-Components API — if `cacheComponents` is ever enabled in
// next.config.ts, this stops working and the date must be made dynamic instead.
export const revalidate = 3600;

export default async function Page({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const { person } = await searchParams;
  // 실제 유효성 검사(가구의 people 목록 기준)는 StartView 안에서 한다 - 여기서는 값만 전달.
  return <StartView personFilter={person ?? "all"} />;
}
