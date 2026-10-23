import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { spawn } from 'child_process';

const API_TARGET = process.env.CARE_API_TARGET || 'http://127.0.0.1:8000';

function autoBackendPlugin(): Plugin {
  return {
    name: 'auto-backend',
    apply: 'serve',
    configureServer() {
      if (process.env.VITEST) return;
      if (process.env.CARE_AUTO_BACKEND === '0') return;

      const checkReq = http.get(`${API_TARGET}/api/health`, (res) => res.resume());
      checkReq.on('error', () => {
        const venvPythonWin = path.resolve(__dirname, '../.venv/Scripts/python.exe');
        const venvPythonUnix = path.resolve(__dirname, '../.venv/bin/python');
        const pythonBin = fs.existsSync(venvPythonWin)
          ? venvPythonWin
          : fs.existsSync(venvPythonUnix)
            ? venvPythonUnix
            : 'python';

        const script = path.resolve(__dirname, 'scripts/start-dev-backend.py');
        console.log(
          `\x1b[32m[backend]\x1b[0m Starting local backend on ${API_TARGET} using ${pythonBin}...`,
        );

        const proc = spawn(pythonBin, [script], {
          stdio: 'inherit',
          windowsHide: true,
        });

        proc.on('error', (err) => {
          console.warn('[backend] Could not auto-start python backend:', err.message);
        });

        const killProc = () => {
          try { proc.kill(); } catch {}
        };
        process.on('exit', killProc);
        process.on('SIGINT', killProc);
        process.on('SIGTERM', killProc);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), autoBackendPlugin()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: 'react-native', replacement: 'react-native-web' },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.tsx', '.ts', '.jsx', '.js'],
  },
  define: {
    global: 'window',
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'react-native-web', './src/lib/sentry'],
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '.kilo/**', '**/.kilo/**'],
    css: false,
  },
  server: {
    port: 3000,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/docs': { target: API_TARGET, changeOrigin: false },
      '/openapi.json': { target: API_TARGET, changeOrigin: false },
      '/redoc': { target: API_TARGET, changeOrigin: false },
    },
  },
});
