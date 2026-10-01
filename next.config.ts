import type { NextConfig } from "next";

// 금융 데이터를 다루므로 기본 보안 헤더를 모든 응답에 붙인다(CSP는 인라인 스크립트·외부 폰트 점검 후 별도 도입).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
