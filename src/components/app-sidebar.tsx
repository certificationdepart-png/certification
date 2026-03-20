"use client"

import * as React from "react"

import { usePathname } from "next/navigation"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  BookOpen02Icon,
  Building02Icon,
  Certificate01Icon,
  ClipboardIcon,
  DashboardSquare01Icon,
  DatabaseSyncIcon,
  MessageEdit01Icon,
} from "@hugeicons/core-free-icons"

import Link from "next/link"
import { routes } from "@/lib/routes"
import { useSchoolOptionsQuery } from "@/hooks/api"

type AdminSidebarUser = {
  name: string
  email: string
  avatar?: string | null
}

function isActivePath(pathname: string, url: string) {
  return pathname === url || pathname.startsWith(`${url}/`)
}
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: AdminSidebarUser
}) {
  const pathname = usePathname()
  const { data: schools = [] } = useSchoolOptionsQuery()

  const navMain = [
    {
      title: "Дашборд",
      url: routes.admin.dashboard,
      icon: <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />,
      isActive: isActivePath(pathname, routes.admin.dashboard),
    },
    {
      title: "Школи",
      url: routes.admin.schools,
      icon: <HugeiconsIcon icon={Building02Icon} strokeWidth={2} />,
      isActive: isActivePath(pathname, routes.admin.schools),
      items: schools.map((s) => {
        const url = routes.admin.schoolDetail(s.id)
        return {
          title: s.name,
          url,
          isActive: pathname === url,
        }
      }),
    },
    {
      title: "Синхронізація",
      url: routes.admin.sync,
      icon: <HugeiconsIcon icon={DatabaseSyncIcon} strokeWidth={2} />,
      isActive: isActivePath(pathname, routes.admin.sync),
    },
  ]

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href={routes.admin.dashboard} />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon icon={Certificate01Icon} strokeWidth={2} className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Сертифікати</span>
                <span className="truncate text-xs">Адмін-панель</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
