import { OrdersView } from "@/components/orders/orders-view";

// Behind the operator sign-in in the layout, which reads the session cookie first:
// this page blocks on the server instead of being validated as an instant page.
export const instant = false;

export default function OrdersPage() {
  return <OrdersView />;
}
