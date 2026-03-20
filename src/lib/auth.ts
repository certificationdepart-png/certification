import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { routes } from "@/lib/routes";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: env.AUTH_SECRET,
  // Important for dev: if you access the app via a non-`localhost` hostname/IP,
  // Better Auth will otherwise scope cookies to the `baseURL` host and the
  // browser may never send the session cookie back.
  // Let Better Auth infer baseURL from the incoming request outside production.
  // On Vercel in production, prefer the platform-provided `VERCEL_URL`.

   trustedOrigins: [
        "http://localhost:3000", 
        ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : [])
      ],
  emailAndPassword: {
    enabled: true,
  },
  // Ensure custom user fields (like `role`) are exposed on `session.user`.
  // This prevents the admin layout from redirecting back to `/login`
  // when it checks for `session.user.role`.
  user: {
    additionalFields: {
      role: {
        type: "string",
        input: false,
      },
    },
  },
  databaseHooks: {
    // Ensure every new sign-up gets admin access by default.
    // (This matches your current requirement: "auto-admin all new sign-ups".)
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, role: "admin" } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export async function getSession() {
  const result = await auth.api.getSession({
    headers: await headers(),
  });
  return result;
}

export async function requireSession() {
  const session = await getSession();
  if (!session?.session) {
    redirect(routes.public.login);
  }
  return session;
}

