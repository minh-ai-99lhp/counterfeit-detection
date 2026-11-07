import { useState, type FormEvent } from "react"
import { useNavigate, useLocation, Navigate } from "react-router-dom"
import { Loader2, LogIn } from "lucide-react"

import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState("admin")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const from = (location.state as { from?: string } | null)?.from ?? "/"

  if (session) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(username, password)
    setBusy(false)
    if (error) setError("Sai tài khoản hoặc mật khẩu.")
    else navigate(from, { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-br from-[oklch(0.23_0.045_262)] via-[oklch(0.19_0.04_262)] to-[oklch(0.14_0.03_262)] p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex justify-center rounded-md bg-white px-4 py-3">
            <img src="/logo.svg" alt="Logo" className="h-8 w-auto" />
          </div>
          <CardTitle>Counterfeit Admin Portal</CardTitle>
          <CardDescription>Hệ thống Quản trị Không Gian Mạng</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="username" className="text-sm font-medium">
                Tài khoản
              </label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Mật khẩu
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LogIn className="size-4" />
              )}
              Đăng nhập
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
