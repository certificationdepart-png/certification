"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { SignupForm } from "@/components/signup-form"
import { HugeiconsIcon } from "@hugeicons/react"
import { LayoutBottomIcon } from "@hugeicons/core-free-icons"
import { authClient } from "@/lib/auth-client"
import { ThemeToggle } from "@/components/theme-toggle"
import { routes } from "@/lib/routes"

export default function SignupPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const formData = new FormData(event.currentTarget)
      const name = String(formData.get("name") ?? "")
      const email = String(formData.get("email") ?? "")
      const password = String(formData.get("password") ?? "")
      const confirmPassword = String(formData.get("confirmPassword") ?? "")

      if (password !== confirmPassword) {
        setError("Паролі не співпадають")
        return
      }

      const result = await authClient.signUp.email({ email, password, name })
      if (result.error) {
        setError(
          result.error.message ?? "Не вдалося створити обліковий запис. Перевірте дані та спробуйте ще раз."
        )
        return
      }

      router.push(routes.admin.dashboard)
      router.refresh()
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
            <SignupForm
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

