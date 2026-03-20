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

export function SignupForm({
  className,
  submitLabel = "Створити обліковий запис",
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
          <h1 className="text-2xl font-bold">Реєстрація</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Створіть обліковий запис адміністратора
          </p>
        </div>
        {errorMessage ? (
          <p className="text-sm text-destructive text-center">
            {errorMessage}
          </p>
        ) : null}
        <Field>
          <FieldLabel htmlFor="name">Ім&apos;я</FieldLabel>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John Doe"
            required
            className="bg-background"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Електронна пошта</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="m@example.com"
            required
            className="bg-background"
          />
          <FieldDescription>
            Ми використаємо цю електронну пошту для зв&apos;язку з вами. Ми не поділимося вашою електронною поштою
            з ніким іншим.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Пароль</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            className="bg-background"
          />
          <FieldDescription>
            Має бути не менше 8 символів.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="confirm-password">Підтвердження пароля</FieldLabel>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            className="bg-background"
          />
          <FieldDescription>Будь ласка, підтвердіть ваш пароль.</FieldDescription>
        </Field>
        <Field>
          <Button type="submit" disabled={submitDisabled}>
            {submitDisabled ? "Зачекайте..." : submitLabel}
          </Button>
        </Field>
        <Field>
          <Button
            variant="outline"
            type="button"
            className="hidden"
            aria-hidden="true"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path
                d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
                fill="currentColor"
              />
            </svg>
            Зареєструватися з GitHub
          </Button>
          <FieldDescription className="px-6 text-center">
            Вже маєте обліковий запис?{" "}
            <a
              href={routes.public.login}
              className="underline underline-offset-4"
            >
              Увійти
            </a>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
