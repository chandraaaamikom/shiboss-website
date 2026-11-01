
export interface OrderReceiptItem {
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface OrderReceipt {
  order_number: string;
  order_status: 'pending' | 'confirmed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'rejected';
  payment_method: 'qris';
  total_amount: number;
  items: OrderReceiptItem[];
}

export interface GuestOrderReceipt extends OrderReceipt {
  guest_access_token: string;
}
