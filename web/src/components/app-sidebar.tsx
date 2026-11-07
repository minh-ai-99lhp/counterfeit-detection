import { Link, useLocation } from "react-router-dom"
import {
  LayoutGrid,
  ShoppingBag,
  PackageCheck,
  ShieldAlert,
  Radar,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const nav: { label?: string; items: { title: string; url: string; icon: typeof LayoutGrid }[] }[] = [
  {
    label: "Thu thập dữ liệu",
    items: [
      { title: "Tổng quan nguồn", url: "/", icon: LayoutGrid },
      { title: "Lazada", url: "/lazada", icon: ShoppingBag },
    ],
  },
  // 2 module top-level riêng (không gộp nhóm)
  {
    items: [
      { title: "CSDL Hàng thật", url: "/genuine", icon: PackageCheck },
      { title: "Phân tích / cảnh báo", url: "/detections", icon: Radar },
    ],
  },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {/* Mở rộng: logo trong khung trắng + tên portal */}
        <div className="flex flex-col gap-2 p-2 group-data-[collapsible=icon]:hidden">
          <div className="flex justify-center rounded-md bg-white px-3 py-2">
            <img src="/logo.svg" alt="Logo" className="h-7 w-auto" />
          </div>
          <div className="px-1">
            <div className="text-sm font-semibold text-sidebar-foreground">
              Counterfeit Admin Portal
            </div>
            <div className="text-xs text-sidebar-foreground/60">
              Quản trị không gian mạng
            </div>
          </div>
        </div>
        {/* Thu gọn: icon vuông thay cho wordmark */}
        <div className="hidden items-center justify-center p-1 group-data-[collapsible=icon]:flex">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldAlert className="size-4" />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {nav.map((group) => (
          <SidebarGroup key={group.label ?? group.items[0].url}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarMenu>
              {group.items.map((item) => {
                const active =
                  item.url === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.url)
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
