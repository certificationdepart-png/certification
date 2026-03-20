"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { routes } from "@/lib/routes"

export function LoginForm({
  className,
  submitLabel = "Увійти",
  submitDisabled = false,
  errorMessage,
  ...props
}: React.ComponentProps<"form"> & {
  submitLabel?: string
  submitDisabled?: boolean
  errorMessage?: string | null
}) {
  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Вхід</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Авторизація для адмін-панелі платформи
          </p>
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive text-center">
            {errorMessage}
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor="email">Електронна пошта</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="m@example.com"
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <div className="flex items-center">
            <FieldLabel htmlFor="password">Пароль</FieldLabel>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field>
          <Button type="submit" disabled={submitDisabled}>
            {submitDisabled ? "Зачекайте..." : submitLabel}
          </Button>
        </Field>
        <FieldDescription className="text-center">
          Не маєте облікового запису?{" "}
          <a href={routes.public.signup} className="underline underline-offset-4">
            Зареєструватися
          </a>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
