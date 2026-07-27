export const CATEGORIES = [
  { id: "bathroom", label: "욕실용품" },
  { id: "kitchen", label: "주방용품" },
  { id: "bedroom", label: "침실&리빙" },
  { id: "personal", label: "개인관리" },
  { id: "appliance", label: "가전&설비" },
];

export const ITEMS = [
  // 욕실용품
  { id: "toothbrush", category: "bathroom", name: "칫솔", icon: "🪥", cycleDays: 90 },
  { id: "razor", category: "bathroom", name: "면도기", icon: "🪒", cycleDays: 14 },
  { id: "shower-puff", category: "bathroom", name: "샤워볼", icon: "🧽", cycleDays: 30 },
  { id: "towel", category: "bathroom", name: "수건", icon: "🛁", cycleDays: 365 },
  { id: "toilet-brush", category: "bathroom", name: "변기솔", icon: "🧹", cycleDays: 180 },

  // 주방용품
  { id: "dish-scrubber", category: "kitchen", name: "수세미", icon: "🧽", cycleDays: 14 },
  { id: "kitchen-sponge", category: "kitchen", name: "주방스펀지", icon: "🫧", cycleDays: 14 },
  { id: "dish-towel", category: "kitchen", name: "행주", icon: "🧣", cycleDays: 30 },
  { id: "rubber-gloves", category: "kitchen", name: "고무장갑", icon: "🧤", cycleDays: 60 },
  { id: "cutting-board", category: "kitchen", name: "도마", icon: "🪵", cycleDays: 365 },
  { id: "electric-kettle", category: "kitchen", name: "전기포트", icon: "🫖", cycleDays: 730 },

  // 침실&리빙
  { id: "pillow-filling", category: "bedroom", name: "베개솜", icon: "☁️", cycleDays: 365 },
  { id: "pillow-cover", category: "bedroom", name: "베개커버(세탁)", icon: "🧺", cycleDays: 7 },
  { id: "blanket", category: "bedroom", name: "이불(세탁)", icon: "🛌", cycleDays: 30 },
  { id: "mattress", category: "bedroom", name: "매트리스", icon: "🛏️", cycleDays: 1825 },
  { id: "curtain", category: "bedroom", name: "커튼(세탁)", icon: "🧵", cycleDays: 90 },

  // 개인관리
  { id: "perfume", category: "personal", name: "향수", icon: "🌸", cycleDays: 730 },

  // 가전&설비
  { id: "power-strip", category: "appliance", name: "멀티탭", icon: "🔌", cycleDays: 1095 },
  { id: "air-purifier-filter", category: "appliance", name: "공기청정기 필터", icon: "🌬️", cycleDays: 180 },
  { id: "ac-filter", category: "appliance", name: "에어컨 필터", icon: "❄️", cycleDays: 14 },
  { id: "washer-filter", category: "appliance", name: "세탁기 필터", icon: "♻️", cycleDays: 90 },
];
