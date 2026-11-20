import { defineConfig } from 'vitest/config';

// Test đơn vị cho các hàm thuần của frontend (không cần trình duyệt, không gọi API thật).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
});
