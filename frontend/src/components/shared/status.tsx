import { Badge } from "@/components/ui/badge";
import {
  ORDER_STATUS,
  PAYMENT_STATUS,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/labels";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return <Badge className={cn("border-transparent", s.className, className)}>{s.label}</Badge>;
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const s = PAYMENT_STATUS[status];
  return <Badge className={cn("border-transparent", s.className, className)}>{s.label}</Badge>;
}
