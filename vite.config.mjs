import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {feedbackServer} from './scripts/feedback-server.mjs';
export default defineConfig({ base: './', plugins: [react(),feedbackServer()], server:{host:'127.0.0.1',port:5173,strictPort:true}, build: { outDir: 'dist', rollupOptions:{input:{setupPointer:'setup-pointer.html',main:'index.html',overlay:'overlay.html',startup:'startup.html'}} } });

