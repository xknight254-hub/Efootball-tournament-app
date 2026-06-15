/**
 * M-Pesa Daraja API Service
 *
 * Handles:
 *  1. OAuth token generation
 *  2. STK Push (C2B) — collect stakes from players
 *  3. STK Push Query — check payment status
 *  4. B2C — payout winnings to players
 */

// ─── Config ───
const MPESA_ENV = (process.env.MPESA_ENV || 'sandbox') as 'sandbox' | 'production';
const MPESA_BASE_URL = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY || '';
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET || '';
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE || '';         // Paybill / Till for receiving
const MPESA_PASSKEY = process.env.MPESA_PASSKEY || '';
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL || 'https://xtournament.duckdns.org/api/wagers/mpesa-callback';

// B2C (payout) config
const MPESA_B2C_SHORTCODE = process.env.MPESA_B2C_SHORTCODE || MPESA_SHORTCODE;
const MPESA_B2C_INITIATOR = process.env.MPESA_B2C_INITIATOR || '';
const MPESA_B2C_SECURITY_CREDENTIAL = process.env.MPESA_B2C_SECURITY_CREDENTIAL || '';
const MPESA_B2C_CALLBACK_URL = process.env.MPESA_B2C_CALLBACK_URL || 'https://xtournament.duckdns.org/api/wagers/b2c-callback';

// ─── Token Cache ───
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error('M-Pesa credentials not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET env vars.');
  }

  const credentials = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

  const res = await fetch(`${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[M-Pesa] OAuth failed:', res.status, errText);
    throw new Error(`M-Pesa OAuth failed: ${res.status}`);
  }

  const data = await res.json() as { access_token: string; expires_in: string };
  cachedToken = data.access_token;
  // expiry is in seconds, cache for 90% of lifetime
  tokenExpiresAt = Date.now() + (parseInt(data.expires_in) * 900);
  return cachedToken;
}

// ─── STK Push (C2B) ───
export interface STKPushParams {
  phoneNumber: string;    // e.g. "254712345678"
  amount: number;         // KES amount
  accountReference: string; // e.g. "wager-123-creator"
  transactionDesc: string;  // e.g. "Wager stake"
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export async function stkPush(params: STKPushParams): Promise<{
  success: boolean;
  checkoutRequestId?: string;
  merchantRequestId?: string;
  message: string;
  raw?: STKPushResponse;
}> {
  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14); // YYYYMMDDHHmmss
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

    // Format phone: ensure 254 prefix
    let phone = params.phoneNumber.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);
    if (phone.startsWith('+')) phone = phone.slice(1);

    const body = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(params.amount),
      PartyA: phone,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    };

    console.log(`[M-Pesa] STK Push: KES ${params.amount} from ${phone} ref=${params.accountReference}`);

    const res = await fetch(`${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as STKPushResponse & { errorCode?: string; errorMessage?: string };

    if (!res.ok || data.ResponseCode !== '0') {
      console.error('[M-Pesa] STK Push failed:', data);
      return {
        success: false,
        message: data.errorMessage || data.ResponseDescription || 'STK Push failed',
        raw: data,
      };
    }

    console.log(`[M-Pesa] STK Push initiated: ${data.CheckoutRequestID}`);
    return {
      success: true,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      message: data.CustomerMessage || 'Check your phone for the M-Pesa prompt',
      raw: data,
    };
  } catch (error: any) {
    console.error('[M-Pesa] STK Push error:', error.message);
    return { success: false, message: `M-Pesa error: ${error.message}` };
  }
}

// ─── STK Push Query ───
export async function stkPushQuery(checkoutRequestId: string): Promise<{
  success: boolean;
  resultCode?: string;
  resultDesc?: string;
}> {
  try {
    const token = await getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

    const body = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const res = await fetch(`${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { ResultCode: string; ResultDesc: string; ResponseCode?: string };

    // ResultCode "0" = success, "2001" = initiated but not completed
    const success = data.ResponseCode === '0' || data.ResultCode === '0';

    return { success, resultCode: data.ResultCode, resultDesc: data.ResultDesc };
  } catch (error: any) {
    console.error('[M-Pesa] STK Query error:', error.message);
    return { success: false, resultDesc: error.message };
  }
}

// ─── B2C Payout (send money to player) ───
export async function b2cPayout(params: {
  phoneNumber: string;
  amount: number;
  occasion: string;       // e.g. "Wager win"
  remarks: string;        // e.g. "Winner payout"
}): Promise<{
  success: boolean;
  conversationId?: string;
  originatorConversationId?: string;
  message: string;
}> {
  try {
    const token = await getAccessToken();

    let phone = params.phoneNumber.replace(/\D/g, '');
    if (phone.startsWith('0')) phone = '254' + phone.slice(1);

    if (!MPESA_B2C_INITIATOR || !MPESA_B2C_SECURITY_CREDENTIAL) {
      console.warn('[M-Pesa] B2C not configured, simulating payout');
      return {
        success: true,
        conversationId: `SIM-${Date.now()}`,
        originatorConversationId: `SIM-ORG-${Date.now()}`,
        message: 'B2C payout simulated (no B2C credentials configured)',
      };
    }

    const body = {
      InitiatorName: MPESA_B2C_INITIATOR,
      SecurityCredential: MPESA_B2C_SECURITY_CREDENTIAL,
      CommandID: 'BusinessPayment',
      Amount: Math.ceil(params.amount),
      PartyA: MPESA_B2C_SHORTCODE,
      PartyB: phone,
      Remarks: params.remarks.slice(0, 100),
      QueueTimeOutURL: MPESA_B2C_CALLBACK_URL,
      ResultURL: MPESA_B2C_CALLBACK_URL,
      Occasion: params.occasion.slice(0, 50),
    };

    console.log(`[M-Pesa] B2C Payout: KES ${params.amount} to ${phone}`);

    const res = await fetch(`${MPESA_BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;

    if (!res.ok || data.ResponseCode !== '0') {
      console.error('[M-Pesa] B2C failed:', data);
      return {
        success: false,
        message: data.errorMessage || data.ResponseDescription || 'B2C payout failed',
      };
    }

    return {
      success: true,
      conversationId: data.ConversationId,
      originatorConversationId: data.OriginatorConversationId,
      message: 'Payout initiated',
    };
  } catch (error: any) {
    console.error('[M-Pesa] B2C error:', error.message);
    return { success: false, message: `B2C error: ${error.message}` };
  }
}

export default {
  getAccessToken,
  stkPush,
  stkPushQuery,
  b2cPayout,
};
