
import type { SupabaseClient } from '@supabase/supabase-js';

export interface AdminOrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number | null;
}

export interface AdminPayment {
  id: string;
  payment_method: string;
  amount: number;
  payment_status: 'pending' | 'paid' | 'rejected';
  verified_at: string | null;
  proof_path: string | null;
  proof_uploaded_at: string | null;
  proof_signed_url: string | null;
}

export interface AdminOrder {
  id: string;
  order_number: string;
  order_source: 'table_qr' | 'cashier';
  customer_name: string;
  table_number: string | null;
  notes: string | null;
  total_amount: number;
  order_status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
  order_items: AdminOrderItem[];
  payments: AdminPayment[];
}

export type AdminOrdersResult =
  | {
      status: 'ready';
      orders: AdminOrder[];
    }
  | {
      status: 'error';
      orders: [];
    };

const PAYMENT_BUCKET = 'payment-proofs';
const SIGNED_URL_TTL = 300;

export async function loadAdminOrders(
  client: SupabaseClient,
): Promise<AdminOrdersResult> {
  try {
    const { data, error } = await client
      .from('orders')
      .select(`
        id,
        order_number,
        order_source,
        customer_name,
        table_number,
        notes,
        total_amount,
        order_status,
        created_at,
        order_items (
          id,
          order_id,
          menu_item_id,
          product_name,
          quantity,
          unit_price,
          subtotal
        ),
        payments (
          id,
          payment_method,
          amount,
          payment_status,
          verified_at,
          proof_path,
          proof_uploaded_at
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !data) {
      console.error('Admin orders query failed:', error?.message);
      return {
        status: 'error',
        orders: [],
      };
    }

    const orders: AdminOrder[] = await Promise.all(
      data.map(async (rawOrder) => {
        const order = rawOrder as unknown as Omit<
          AdminOrder,
          'payments'
        > & {
          payments: Omit<AdminPayment, 'proof_signed_url'>[];
        };

        const payments: AdminPayment[] = await Promise.all(
          (order.payments ?? []).map(async (payment) => {
            let signedUrl: string | null = null;

            if (
              payment.proof_path &&
              payment.payment_method === 'qris'
            ) {
              try {
                const { data: signed, error: signedError } =
                  await client.storage
                    .from(PAYMENT_BUCKET)
                    .createSignedUrl(
                      payment.proof_path,
                      SIGNED_URL_TTL
                    );

                if (!signedError && signed?.signedUrl) {
                  signedUrl = signed.signedUrl;
                } else if (signedError) {
                  console.error(
                    'Payment proof signed URL failed:',
                    signedError.message
                  );
                }
              } catch (error) {
                console.error(
                  'Payment proof storage error:',
                  error
                );
              }
            }

            return {
              ...payment,
              proof_signed_url: signedUrl,
            };
          })
        );

        return {
          ...order,
          order_items: order.order_items ?? [],
          payments,
        };
      })
    );

    return {
      status: 'ready',
      orders,
    };

  } catch (error) {
    console.error('Unexpected admin orders error:', error);

    return {
      status: 'error',
      orders: [],
    };
  }
}
