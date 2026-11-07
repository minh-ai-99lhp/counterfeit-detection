import { Radar } from "lucide-react"
import { Navigate, Route, Routes } from "react-router-dom"

import { RequireAuth } from "@/lib/auth"
import { AppLayout } from "@/components/app-layout"
import { LoginPage } from "@/pages/LoginPage"
import { SourcesPage } from "@/pages/SourcesPage"
import { LazadaPage } from "@/pages/LazadaPage"
import { GenuinePage } from "@/pages/GenuinePage"
import { Placeholder } from "@/pages/Placeholder"

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<SourcesPage />} />
        <Route path="lazada" element={<LazadaPage />} />
        <Route path="genuine" element={<GenuinePage />} />
        <Route
          path="detections"
          element={
            <Placeholder
              title="Phân tích / cảnh báo"
              description="Module 3: AI so khớp sản phẩm nghi ngờ với hàng thật, chấm điểm nghi ngờ và phát cảnh báo cho cán bộ duyệt."
              icon={<Radar className="size-10" />}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
