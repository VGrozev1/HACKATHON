import { Resend } from "resend";

export type EmailOrderLine = { product: string; quantity: number };

export type EmailOrder = {
  id: string;
  supplier: string;
  lines: EmailOrderLine[];
  totalEur: number;
};

export async function sendSupplierEmail(order: EmailOrder): Promise<void> {
  // Built lazily, not at module load — so importing this file never
  // requires RESEND_API_KEY to already be set in the environment.
  const resend = new Resend(process.env.RESEND_API_KEY);

  const itemLines = order.lines
    .map((line) => `- ${line.product}: ${line.quantity}`)
    .join("\n");

  const text = [
    `New purchase order for ${order.supplier}.`,
    "",
    itemLines,
    "",
    `Order total: €${order.totalEur.toFixed(2)}`,
  ].join("\n");

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM ?? "Vending AI <onboarding@resend.dev>",
    to: process.env.SUPPLIER_DEMO_EMAIL!,
    subject: `Purchase order ${order.id} for ${order.supplier}`,
    text,
  });

  if (error) {
    throw new Error(
      `Failed to email purchase order ${order.id} to ${order.supplier}: ${error.message ?? JSON.stringify(error)}`,
    );
  }
}
