export type EmotionColor = "green" | "pink" | "blue" | "red" | "yellow" | "purple";

export interface Emotion {
  name: string;
  emoji: string;
  color: EmotionColor;
}

export const EMOTIONS: Emotion[] = [
  // 행복 (Green)
  { name: "행복", emoji: "😊", color: "green" },
  { name: "기쁨", emoji: "😄", color: "green" },
  { name: "감사", emoji: "🙏", color: "green" },
  { name: "편안함", emoji: "😌", color: "green" },
  { name: "희망", emoji: "🌱", color: "green" },
  { name: "자신감", emoji: "😎", color: "green" },
  { name: "뿌듯함", emoji: "😁", color: "green" },
  { name: "만족", emoji: "☺️", color: "green" },

  // 사랑 (Pink)
  { name: "사랑", emoji: "🥰", color: "pink" },
  { name: "설렘", emoji: "🤩", color: "pink" },
  { name: "존중", emoji: "🤝", color: "pink" },
  { name: "자랑스러움", emoji: "🥹", color: "pink" },

  // 슬픔 (Blue)
  { name: "슬픔", emoji: "😢", color: "blue" },
  { name: "외로움", emoji: "🥺", color: "blue" },
  { name: "서운함", emoji: "😞", color: "blue" },
  { name: "속상함", emoji: "😔", color: "blue" },
  { name: "그리움", emoji: "🫶", color: "blue" },
  { name: "우울", emoji: "😭", color: "blue" },

  // 분노 (Red)
  { name: "화남", emoji: "😡", color: "red" },
  { name: "짜증", emoji: "😤", color: "red" },
  { name: "분노", emoji: "🤬", color: "red" },
  { name: "억울함", emoji: "🫤", color: "red" },
  { name: "답답함", emoji: "😣", color: "red" },

  // 불안 (Yellow)
  { name: "불안", emoji: "😰", color: "yellow" },
  { name: "걱정", emoji: "😟", color: "yellow" },
  { name: "긴장", emoji: "😬", color: "yellow" },
  { name: "두려움", emoji: "😨", color: "yellow" },
  { name: "부담", emoji: "🫢", color: "yellow" },

  // 중립 (Purple)
  { name: "피곤함", emoji: "😴", color: "purple" },
  { name: "멍함", emoji: "😶", color: "purple" },
  { name: "혼란", emoji: "😵‍💫", color: "purple" },
  { name: "고민", emoji: "🤔", color: "purple" },
  { name: "집중", emoji: "🧐", color: "purple" },
  { name: "놀람", emoji: "😲", color: "purple" },
  { name: "심심함", emoji: "🥱", color: "purple" },
  { name: "무기력", emoji: "🫠", color: "purple" },
  { name: "담담함", emoji: "😐", color: "purple" },
];

export const COLORS: Record<EmotionColor, { bg: string; border: string; text: string }> = {
  green: { bg: "var(--emotion-green-bg)", border: "var(--emotion-green-border)", text: "var(--emotion-green-text)" },
  pink: { bg: "var(--emotion-pink-bg)", border: "var(--emotion-pink-border)", text: "var(--emotion-pink-text)" },
  blue: { bg: "var(--emotion-blue-bg)", border: "var(--emotion-blue-border)", text: "var(--emotion-blue-text)" },
  red: { bg: "var(--emotion-red-bg)", border: "var(--emotion-red-border)", text: "var(--emotion-red-text)" },
  yellow: { bg: "var(--emotion-yellow-bg)", border: "var(--emotion-yellow-border)", text: "var(--emotion-yellow-text)" },
  purple: { bg: "var(--emotion-purple-bg)", border: "var(--emotion-purple-border)", text: "var(--emotion-purple-text)" },
};

export const DEFINITIONS: Record<string, string> = {
  행복: "지금 이 순간이 즐겁고 좋게 느껴지는 마음",
  기쁨: "원하던 일이 이루어져 마음이 환해지는 느낌",
  감사: "누군가 또는 무언가가 고맙게 느껴지는 마음",
  편안함: "몸과 마음이 느긋하고 안정된 상태",
  희망: "앞으로 좋아질 거라는 기대가 차오르는 마음",
  자신감: "내 힘으로 잘 해낼 수 있다고 느끼는 마음",
  뿌듯함: "스스로 해낸 일에 만족스럽고 흐뭇한 느낌",
  만족: "지금 가진 것으로 충분하다고 느끼는 마음",
  사랑: "누군가를 향한 다정하고 애틋한 마음",
  설렘: "기대와 두근거림이 함께 차오르는 마음",
  존중: "상대를 있는 그대로 소중히 여기는 마음",
  자랑스러움: "누군가 혹은 나 자신이 대견하게 느껴지는 마음",
  슬픔: "마음이 무겁고 눈물이 날 것 같은 느낌",
  외로움: "쓸쓸하거나 혼자 있는 느낌",
  서운함: "기대한 만큼 되지 않아 섭섭한 마음",
  속상함: "일이 마음처럼 되지 않아 마음이 상한 느낌",
  그리움: "누군가 또는 무언가가 보고 싶은 마음",
  우울: "기운이 없고 마음이 가라앉는 느낌",
  화남: "무언가에 욱하고 치미는 마음",
  짜증: "사소한 일에도 신경이 곤두서는 느낌",
  분노: "속에서 크게 끓어오르는 강한 화",
  억울함: "부당하게 느껴져 답답하고 속상한 마음",
  답답함: "속이 꽉 막힌 듯 갑갑한 느낌",
  불안: "마음이 조마조마하고 진정되지 않는 느낌",
  걱정: "일이 잘못될까 봐 마음이 쓰이는 상태",
  긴장: "몸과 마음이 잔뜩 곤두서 있는 느낌",
  두려움: "무섭거나 겁이 나는 마음",
  부담: "짊어진 무게가 무겁게 느껴지는 마음",
  피곤함: "몸과 마음의 기운이 다 빠진 상태",
  멍함: "생각이 잠시 멈춘 듯 텅 빈 느낌",
  혼란: "생각이 뒤엉켜 정리가 안 되는 상태",
  고민: "어떻게 해야 할지 계속 생각하게 되는 마음",
  집중: "한 가지에 마음이 온전히 쏠려 있는 상태",
  놀람: "예상치 못한 일에 마음이 덜컥하는 느낌",
  심심함: "딱히 할 일이 없어 무료한 느낌",
  무기력: "아무것도 하고 싶지 않은 축 처진 마음",
  담담함: "동요 없이 잔잔하게 가라앉아 있는 마음",
};
