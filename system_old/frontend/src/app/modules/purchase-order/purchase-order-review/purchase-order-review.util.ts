import { PurchaseOrderItem } from 'app/core/services/purchase-order.service';

export interface PurchaseOrderReviewItem {
  name: string;
  description: string;
  qty: number;
  unitPrice: number;
  amount: number;
}

export function mapPurchaseOrderReviewItems(
  items: PurchaseOrderItem[] | null | undefined
): PurchaseOrderReviewItem[] {
  return (items || []).map((item) => ({
    name: item.item,
    description: item.description,
    qty: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.amount,
  }));
}
