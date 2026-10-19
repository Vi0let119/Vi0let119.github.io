import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 构建产物通过站点 tools/route_plan/dist/ 子目录提供（外层是纯静态站），
 * 因此 base 用相对路径 './'。
 *
 * 发布构建的 Key 环境单独放在 env-build/（值故意留空）：
 * 产物不内联高德 Key，访客首次打开在引导页自行填写；
 * npm run dev（command === 'serve'）仍读仓库根 .env.local，方便本地开发。
 */
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './',
  envDir: command === 'build' ? 'env-build' : '.',
  server: {
    port: 5173,
    open: true,
  },
}));
