import type { ReactNode } from "react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function Placeholder({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: ReactNode
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <Card className="border-dashed">
        <CardHeader className="items-center py-16 text-center">
          {icon && <div className="mb-3 text-muted-foreground">{icon}</div>}
          <CardTitle className="text-muted-foreground">Chưa dựng</CardTitle>
          <CardDescription className="max-w-md">{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
