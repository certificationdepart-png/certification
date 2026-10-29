import { redirect } from "next/navigation";

// Public registration is disabled server-side in Better Auth as well.
export default function SignupPage() {
  redirect("/login");
}
