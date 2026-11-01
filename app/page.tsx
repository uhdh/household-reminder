import { auth } from "@/auth";
import { StartView } from "./start-view";
import { HomeEntry } from "./home-entry";

// 웹 방문자에게만 소개를 보여주고, 설치한 앱은 로그인 또는 월별 가계부로 바로 진입한다.
export default async function Page() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.email);
  return <HomeEntry signedIn={signedIn}>{!signedIn && <StartView />}</HomeEntry>;
}
