import { getDb } from "./db";
import { getAllChores } from "./chores-db";
import { getAllSupplies } from "./supplies-db";
import { computeChoreStatus, todayISO } from "./chores";
import { computeSupplyStatus } from "./supplies";

export type SectionStatus = { ready: false } | { ready: true; label: string };

export type Section = {
  id: string;
  name: string;
  icon: string;
  href: string;
  getStatus: () => SectionStatus;
};

export const SECTIONS: Section[] = [
  {
    id: "cleaning",
    name: "청소 관리",
    icon: "🧹",
    href: "/cleaning",
    getStatus: () => {
      const today = todayISO();
      const overdueCount = getAllChores(getDb()).filter(
        (row) => computeChoreStatus(row.last_done_at, row.interval_value, row.interval_unit, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
  {
    id: "supplies",
    name: "생필품 관리",
    icon: "🧴",
    href: "/supplies",
    getStatus: () => {
      const today = todayISO();
      const overdueCount = getAllSupplies(getDb()).filter(
        (row) => computeSupplyStatus(row.last_done_at, row.cycle_days, today).overdue
      ).length;
      return overdueCount > 0
        ? { ready: true, label: `밀린 항목 ${overdueCount}개` }
        : { ready: true, label: "전부 완료" };
    },
  },
  {
    id: "emotion-cards",
    name: "감정카드",
    icon: "💌",
    href: "/emotion-cards",
    getStatus: () => ({ ready: false }),
  },
  {
    id: "portfolio",
    name: "포트폴리오",
    icon: "💼",
    href: "/portfolio",
    getStatus: () => ({ ready: false }),
  },
];
