"use client"

import * as React from "react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon } from "@hugeicons/core-free-icons"
import Link from "next/link"

export function NavMain({
  items = [],
}: {
  items?: {
    title: string
    url: string
    icon: React.ReactNode
    isActive?: boolean
    items?: {
      title: string
      url: string
      isActive?: boolean
    }[]
  }[]
}) {
  const navItems = items ?? []
  // Base UI's Collapsible warns when `defaultOpen` changes after the first render.
  // Since we derive `isActive` from the current route, we use controlled `open` state instead.
  const [openStateByTitle, setOpenStateByTitle] = React.useState<Record<
    string,
    boolean
  >>(() => {
    const initial: Record<string, boolean> = {}
    for (const item of navItems) {
      initial[item.title] = !!item.isActive
    }
    return initial
  })

  const activeTitlesKey = React.useMemo(() => {
    const active = navItems.filter((i) => i.isActive).map((i) => i.title)
    active.sort()
    return active.join("|")
  }, [navItems])

  React.useEffect(() => {
    if (!activeTitlesKey) return

    setOpenStateByTitle((prev) => {
      const next = { ...prev }
      for (const item of navItems) {
        if (item.isActive) next[item.title] = true
      }
      return next
    })
  }, [activeTitlesKey])

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Адмін-панель</SidebarGroupLabel>
      <SidebarMenu>
        {navItems.map((item) => (
          <Collapsible
            key={item.title}
            open={openStateByTitle[item.title] ?? false}
            onOpenChange={(open) =>
              setOpenStateByTitle((prev) => ({
                ...prev,
                [item.title]: open,
              }))
            }
            render={<SidebarMenuItem />}
          >
            <SidebarMenuButton
              tooltip={item.title}
              isActive={item.isActive}
              render={<Link href={item.url} />}
            >
              {item.icon}
              <span>{item.title}</span>
            </SidebarMenuButton>
            {item.items?.length ? (
              <>
                <CollapsibleTrigger
                  render={
                    <SidebarMenuAction className="aria-expanded:rotate-90" />
                  }
                >
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                  <span className="sr-only">Toggle</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.url}>
                        <SidebarMenuSubButton
                          isActive={subItem.isActive}
                          render={<Link href={subItem.url} />}
                        >
                          <span className="truncate">{subItem.title}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </>
            ) : null}
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
