import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminRole } from "@/lib/api-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { SystemStatusLights } from "@/components/system-status-lights";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.session) {
    redirect("/login");
  }

  // `session.user.role` should be present thanks to `user.additionalFields.role`,
  // but we keep a DB fallback to avoid redirect loops if Better Auth returns
  // a different shape for the user object.
  let role = (session.user as unknown as { role?: string | null }).role;
  if (!role) {
    const userId = (session.user as unknown as { id?: string | null }).id;
    if (userId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      role = dbUser?.role ?? role;
    }
  }

  if (!isAdminRole(role)) {
    redirect("/login");
  }

  async function logoutAction() {
    "use server";
    await auth.api.signOut({
      headers: await headers(),
    });
    redirect("/login");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-sidebar">
      <SidebarProvider className="flex min-h-0 flex-1 items-stretch">
        <AppSidebar
          user={{
            name:
              ((session.user as unknown as { name?: string }).name ??
                (session.user.email?.split("@")[0] as string) ??
                "Адмін") as string,
            email: (session.user.email ?? "") as string,
            avatar: null,
          }}
        />
        <SidebarInset className="min-h-0 self-stretch">
          <header className="flex h-14 shrink-0 items-center justify-between border-b  px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-vertical:h-4 data-vertical:self-auto"
              />
              <span className="text-sm font-medium text-muted-foreground">
                Адмін-панель
              </span>
            </div>
            <div className="flex items-center gap-4">
              <SystemStatusLights />
              <ThemeToggle />
              <div className="text-sm text-muted-foreground">
                {session.user.email}
              </div>
              <form action={logoutAction}>
                <Button type="submit" variant="destructive" size="sm">
                  Вийти
                </Button>
              </form>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <NuqsAdapter>{children}</NuqsAdapter>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

