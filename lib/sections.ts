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
    getStatus: () => ({ ready: false }),
  },
  {
    id: "supplies",
    name: "생필품 관리",
    icon: "🧴",
    href: "/supplies",
    getStatus: () => ({ ready: false }),
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
