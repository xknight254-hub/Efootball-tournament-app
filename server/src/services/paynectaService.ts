/**
 * Paynecta Payment Gateway Service
 *
 * Handles:
 *  1. Payment initialization (STK Push via Paynecta)
 *  2. Payment status query
 *  3. Payment links management
 *  4. Banks listing
 *  5. Currency rates
 */

// ─── Config ───
const PAYNECTA_BASE_URL = 'https://paynecta.co.ke/api/v1';
const PAYNECTA_API_KEY = process.env.PAYNECTA_API_KEY || '';
const PAYNECTA_USER_EMAIL = process.env.PAYNECTA_USER_EMAIL || '';

// ─── Types ───
export interface PaynectaPaymentResponse {
  success: boolean;
  message: string;
  timestamp: string;
  data: {
    transaction_reference: string;
    CheckoutRequestID: string;
  };
}

export interface PaynectaStatusResponse {
  success: boolean;
  message: string;
  data: {
    transaction_reference: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    status_label: string;
    amount: number;
    formatted_amount: string;
    mobile_number: string;
    mpesa_receipt_number: string | null;
    result_code: number;
    result_description: string;
    failure_reason: string | null;
    initiated_at: string;
    paid_at: string | null;
    completed_at: string | null;
    failed_at: string | null;
    checkout_request_id: string;
    link: {
      code: string;
      name: string;
      display_name: string;
    };
    payment_method: {
      type: string;
      display_name: string;
    };
  };
}

export interface PaynectaLinksResponse {
  success: boolean;
  data: {
    links: Array<{
      unique_code: string;
      name: string;
      display_name: string;
      slug: string;
      description: string;
      is_invoice: boolean;
      created_at: string;
      updated_at: string;
      payment_methods_count: number;
      has_customization: boolean;
    }>;
    total: number;
  };
}

export interface PaynectaBanksResponse {
  success: boolean;
  data: {
    banks: Array<{
      bank_id: string;
      bank_name: string;
      paybill_number: string;
    }>;
    total: number;
  };
}

// ─── Helpers ───
function getHeaders(): Record<string, string> {
  return {
    'X-API-Key': PAYNECTA_API_KEY,
    'X-User-Email': PAYNECTA_USER_EMAIL,
    'Content-Type': 'application/json',
  };
}

function formatMobileNumber(phone: string): string {
  let number = phone.replace(/[\s\-\+]/g, '');
  if (number.startsWith('0')) {
    number = '254' + number.slice(1);
  }
  return number;
}

function isValidSafaricomNumber(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone);
}

// ─── Core API ───

/**
 * Initialize a payment via Paynecta STK Push
 *
 * @param linkCode - Payment link code from Paynecta dashboard
 * @param mobileNumber - Safaricom number (07XX, 01XX, 2547XX, 2541XX)
 * @param amount - Amount in KES (1–250,000)
 */
export async function initializePayment(
  linkCode: string,
  mobileNumber: string,
  amount: number
): Promise<{
  success: boolean;
  transactionReference?: string;
  checkoutRequestId?: string;
  message: string;
  raw?: any;
}> {
  if (!PAYNECTA_API_KEY || !PAYNECTA_USER_EMAIL) {
    return { success: false, message: 'Paynecta credentials not configured. Set PAYNECTA_API_KEY and PAYNECTA_USER_EMAIL.' };
  }

  const formatted = formatMobileNumber(mobileNumber);

  if (!isValidSafaricomNumber(formatted)) {
    return { success: false, message: 'Invalid Safaricom number. Use 07XX, 01XX, or 254XXX format.' };
  }

  if (amount < 1 || amount > 250000) {
    return { success: false, message: 'Amount must be between KES 1 and KES 250,000.' };
  }

  try {
    const res = await fetch(`${PAYNECTA_BASE_URL}/payment/initialize`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        code: linkCode,
        mobile_number: formatted,
        amount: Math.ceil(amount),
      }),
    });

    const data = await res.json() as PaynectaPaymentResponse & {
      errors?: Record<string, string[]>;
      message?: string;
    };

    if (!res.ok) {
      const errMsg = data.message
        || Object.values(data.errors || {}).flat().join(', ')
        || `Paynecta error ${res.status}`;
      console.error('[Paynecta] Initialize failed:', errMsg);
      return { success: false, message: errMsg, raw: data };
    }

    console.log(`[Paynecta] Payment initialized: ${data.data.transaction_reference}`);
    return {
      success: true,
      transactionReference: data.data.transaction_reference,
      checkoutRequestId: data.data.CheckoutRequestID,
      message: data.message || 'Check your phone for the M-Pesa prompt.',
      raw: data,
    };
  } catch (error: any) {
    console.error('[Paynecta] Initialize error:', error.message);
    return { success: false, message: `Paynecta error: ${error.message}` };
  }
}

/**
 * Query payment status by transaction reference
 */
export async function queryPaymentStatus(
  transactionReference: string
): Promise<{
  success: boolean;
  status?: string;
  statusLabel?: string;
  amount?: number;
  formattedAmount?: string;
  mpesaReceipt?: string | null;
  failureReason?: string | null;
  paidAt?: string | null;
  raw?: any;
}> {
  if (!PAYNECTA_API_KEY || !PAYNECTA_USER_EMAIL) {
    return { success: false };
  }

  try {
    const res = await fetch(
      `${PAYNECTA_BASE_URL}/payment/status?transaction_reference=${encodeURIComponent(transactionReference)}`,
      { headers: getHeaders() }
    );

    const data = await res.json() as PaynectaStatusResponse;

    if (!res.ok || !data.success) {
      return { success: false, raw: data };
    }

    return {
      success: true,
      status: data.data.status,
      statusLabel: data.data.status_label,
      amount: data.data.amount,
      formattedAmount: data.data.formatted_amount,
      mpesaReceipt: data.data.mpesa_receipt_number,
      failureReason: data.data.failure_reason,
      paidAt: data.data.paid_at,
      raw: data,
    };
  } catch (error: any) {
    console.error('[Paynecta] Query error:', error.message);
    return { success: false };
  }
}

/**
 * Get all payment links
 */
export async function getPaymentLinks(): Promise<PaynectaLinksResponse | null> {
  try {
    const res = await fetch(`${PAYNECTA_BASE_URL}/links`, { headers: getHeaders() });
    const data = await res.json() as PaynectaLinksResponse;
    return data.success ? data : null;
  } catch (error: any) {
    console.error('[Paynecta] Links error:', error.message);
    return null;
  }
}

/**
 * Get a single payment link by code
 */
export async function getPaymentLink(code: string): Promise<any> {
  try {
    const res = await fetch(`${PAYNECTA_BASE_URL}/links/${code}`, { headers: getHeaders() });
    return await res.json();
  } catch (error: any) {
    console.error('[Paynecta] Link error:', error.message);
    return null;
  }
}

/**
 * Get all banks
 */
export async function getBanks(): Promise<PaynectaBanksResponse | null> {
  try {
    const res = await fetch(`${PAYNECTA_BASE_URL}/banks`, { headers: getHeaders() });
    const data = await res.json() as PaynectaBanksResponse;
    return data.success ? data : null;
  } catch (error: any) {
    console.error('[Paynecta] Banks error:', error.message);
    return null;
  }
}

/**
 * Get all currency rates (base: KES)
 */
export async function getCurrencyRates(): Promise<any> {
  try {
    const res = await fetch(`${PAYNECTA_BASE_URL}/currency-rates`, { headers: getHeaders() });
    return await res.json();
  } catch (error: any) {
    console.error('[Paynecta] Currency error:', error.message);
    return null;
  }
}

/**
 * Convert currency
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string,
  date?: string
): Promise<any> {
  try {
    const body: any = { amount, from, to };
    if (date) body.date = date;
    const res = await fetch(`${PAYNECTA_BASE_URL}/currency-rates/convert`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (error: any) {
    console.error('[Paynecta] Convert error:', error.message);
    return null;
  }
}

export default {
  initializePayment,
  queryPaymentStatus,
  getPaymentLinks,
  getPaymentLink,
  getBanks,
  getCurrencyRates,
  convertCurrency,
  formatMobileNumber,
  isValidSafaricomNumber,
};
