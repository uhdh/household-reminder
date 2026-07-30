import { HomeView } from "./home-view";

// The greeting date comes from new Date() at render time; without this the page
// is statically rendered once at build and the date freezes. NOTE: `revalidate`
// is the pre-Cache-Components API — if `cacheComponents` is ever enabled in
// next.config.ts, this stops working and the date must be made dynamic instead.
export const revalidate = 3600;

export default async function Page() {
  return <HomeView />;
}
