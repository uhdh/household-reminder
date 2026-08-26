import {
  IconHouseFill,
  IconWonCircleArrowLeftFill,
  IconPhoneFill,
  IconBusFrontsideFill,
  IconCheckmarkShieldFill,
  IconReceiptFill,
  IconFlameFill,
  IconGiftFill,
  IconCarFrontsideFill,
  IconCartFill,
  IconForkSpoonFill,
  IconCupHeatwaveFill,
  IconBoxFlapFill,
  IconHospitalcrossBuildingFill,
  IconDumbbellFill,
  IconTruckFill,
  IconTshirtFill,
  IconHeartFill,
  IconWrenchFill,
  IconCarFill,
  IconArrowClockwiseCircularFill,
  IconMusicalnoteDoubleFill,
  IconFireworkFill,
  IconTagFill,
  IconWonCircleFill,
  IconWonArrowClockwiseCircularFill,
  IconPencilFill,
  IconQuestionmarkCircleFill,
} from "@karrotmarket/react-monochrome-icon";
import type { ComponentType, SVGProps } from "react";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

const CATEGORY_ICONS: Record<string, IconComponent> = {
  관리비: IconHouseFill,
  대출원리금: IconWonCircleArrowLeftFill,
  통신: IconPhoneFill,
  교통: IconBusFrontsideFill,
  보험: IconCheckmarkShieldFill,
  세금: IconReceiptFill,
  가스비: IconFlameFill,
  엄마용돈: IconGiftFill,
  주유: IconCarFrontsideFill,
  식재료: IconCartFill,
  식비: IconForkSpoonFill,
  카페: IconCupHeatwaveFill,
  생필품: IconBoxFlapFill,
  병원: IconHospitalcrossBuildingFill,
  운동: IconDumbbellFill,
  배달: IconTruckFill,
  패션: IconTshirtFill,
  영양제: IconHeartFill,
  자동차: IconWrenchFill,
  렌트카: IconCarFill,
  구독: IconArrowClockwiseCircularFill,
  문화: IconMusicalnoteDoubleFill,
  경조사: IconFireworkFill,
  기타: IconTagFill,
  월급: IconWonCircleFill,
  금융수입: IconWonArrowClockwiseCircularFill,
  자산수정: IconPencilFill,
  미분류: IconQuestionmarkCircleFill,
};

export function CategoryIcon({
  name,
  size = 16,
  className,
}: {
  name: string | null;
  size?: number;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[name ?? "미분류"] ?? IconTagFill;
  return <Icon size={size} className={className} aria-hidden="true" />;
}
