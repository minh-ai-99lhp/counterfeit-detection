import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  // .env nằm ở gốc project (chung với worker). Vite chỉ expose biến VITE_* ra client.
  envDir: path.resolve(__dirname, ".."),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: true,
    // Mã nguồn nằm trên ổ Windows (/mnt/d) — WSL2 KHÔNG nhận inotify ở đây,
    // nên HMR không thấy file đổi. Bắt buộc polling để vite phát hiện thay đổi.
    watch: { usePolling: true, interval: 300 },
  },
})
