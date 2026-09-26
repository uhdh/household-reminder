import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Next가 번들 시 자동 처리하는 "server-only"를 vitest(Vite)에서는 빈 모듈로 대체.
      'server-only': fileURLToPath(new URL('./vitest.server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // PGlite(인메모리 Postgres) 테스트는 PC 부하에 따라 5초 기본값을 가끔 넘겨 오탐 실패가 난다.
    testTimeout: 15000,
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**', '**/archive/**'],
  },
})
