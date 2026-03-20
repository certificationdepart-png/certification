"use client"

import { useState } from "react"

import { LoginForm } from "@/components/login-form"
import { HugeiconsIcon } from "@hugeicons/react"
import { LayoutBottomIcon } from "@hugeicons/core-free-icons"
import { authClient } from "@/lib/auth-client"
import { ThemeToggle } from "@/components/theme-toggle"
import { routes } from "@/lib/routes"

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const email = String(formData.get("email") ?? "")
      const password = String(formData.get("password") ?? "")

      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setError(
          result.error.message ?? "Не вдалося увійти. Перевірте дані та спробуйте ще раз."
        )
        return
      }

      // Use a full navigation to ensure the browser sends updated Better Auth cookies.
      // Client-side routing can otherwise temporarily read a stale cookie cache.
      window.location.assign(routes.admin.dashboard)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Непередбачена помилка")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2 relative">
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} className="size-4" />
            </div>
            Адмін Панель
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm
              onSubmit={handleSubmit}
              submitDisabled={loading}
              errorMessage={error}
            />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          src="/background.jpg"
          alt="Image"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}

