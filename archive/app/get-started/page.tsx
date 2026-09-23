import type { Metadata } from "next";
import { StartView } from "../start-view";

export const metadata: Metadata = {
  title: "우리집 소개 | 우리집",
  description: "뱅크샐러드 데이터로 부부의 자산과 가계부를 자동으로 관리하는 방법을 소개합니다.",
};

export const revalidate = 3600;

export default function GetStartedPage() {
  return <StartView showHomeLink />;
}
