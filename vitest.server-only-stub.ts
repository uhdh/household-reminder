// vitest(Vite) 환경에는 Next.js 번들러가 자동으로 처리해주는 "server-only"의
// react-server export condition이 없어 실제 패키지를 그대로 쓰면 항상 던진다.
// 테스트에서만 아무 일도 하지 않는 빈 모듈로 대체한다.
export {};
