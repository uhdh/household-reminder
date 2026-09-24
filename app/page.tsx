import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StartView } from "./start-view";

// 로그인 사용자는 바로 가계부로(가구가 없으면 /finance가 온보딩으로 보낸다), 비로그인 방문자에게만 소개 페이지.
export default async function Page() {
  const session = await auth();
  if (session?.user?.email) redirect("/finance");
  return <StartView />;
}
