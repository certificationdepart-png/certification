"use client";

import { useMutation } from "@tanstack/react-query";

import { apiRoutes } from "@/lib/api-routes";

export type VerifyBotResult = { ok: true; firstName: string; username: string | null };

export function useVerifyTelegramBotMutation() {
  return useMutation({
    mutationFn: async (token: string): Promise<VerifyBotResult> => {
      const res = await fetch(apiRoutes.telegramVerifyBot, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = (await res.json()) as
        | { ok: true; firstName: string; username: string | null }
        | { ok: false; error?: string };
      if (!res.ok || !payload.ok) {
        const message =
          !res.ok && "error" in payload && payload.error
            ? payload.error
            : "Не вдалося перевірити токен. Спробуйте ще раз.";
        throw new Error(message);
      }
      return payload;
    },
  });
}
