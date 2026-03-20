import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { auth } from "@/lib/auth";

const baseURL =
  typeof window === "undefined" ? process.env.NEXT_PUBLIC_APP_URL : window.location.origin;

export const authClient = createAuthClient({
  // Use the current browser origin so the session cookie is set/read on the same host.
  // This avoids `localhost` vs `127.x/172.x` cookie-domain mismatches during dev.
  baseURL,
  plugins: [inferAdditionalFields<typeof auth>()],
});

