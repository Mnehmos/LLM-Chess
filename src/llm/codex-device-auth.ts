/**
 * Codex ChatGPT device auth flow used by Codex CLI.
 * Source: openai/codex (CLIENT_ID constant + deviceauth endpoints).
 */
export const CODEX_OAUTH_ISSUER = 'https://auth.openai.com';
export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
const CODEX_AUTH_PROXY_BASE = '/api/codex-auth';

interface DeviceAuthResponse {
  device_auth_id: string;
  user_code: string;
  interval: string;
  expires_at: string;
}

interface DeviceAuthTokenResponse {
  authorization_code: string;
  code_challenge: string;
  code_verifier: string;
}

export interface CodexDeviceCode {
  deviceAuthId: string;
  userCode: string;
  intervalSeconds: number;
  expiresAt: string;
  verificationUrl: string;
}

export interface CodexDeviceVerificationResult {
  status: 'pending' | 'verified';
  retryAfterSeconds?: number;
  authorizationCode?: string;
  codeChallenge?: string;
  codeVerifier?: string;
}

export async function requestCodexDeviceCode(): Promise<CodexDeviceCode> {
  const response = await fetchWithRateLimitRetry(`${CODEX_AUTH_PROXY_BASE}/deviceauth/usercode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: CODEX_OAUTH_CLIENT_ID }),
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      throw new Error('Too many device-code requests. Wait a minute, then try again.');
    }
    throw new Error(`Device auth request failed (${response.status}): ${text || 'unknown error'}`);
  }

  const data = await response.json() as Partial<DeviceAuthResponse>;
  if (!data.user_code || !data.device_auth_id || !data.expires_at) {
    throw new Error('Invalid device auth response');
  }

  const interval = Number(data.interval || '5');
  return {
    deviceAuthId: data.device_auth_id,
    userCode: data.user_code,
    intervalSeconds: Number.isFinite(interval) && interval > 0 ? interval : 5,
    expiresAt: data.expires_at,
    verificationUrl: `${CODEX_OAUTH_ISSUER}/codex/device`,
  };
}

export async function checkCodexDeviceVerification(
  deviceAuthId: string,
  userCode: string,
): Promise<CodexDeviceVerificationResult> {
  const response = await fetch(`${CODEX_AUTH_PROXY_BASE}/deviceauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }),
  });

  // Codex CLI treats 403/404 as "still pending authorization".
  if (response.status === 403 || response.status === 404) {
    return { status: 'pending' };
  }
  // Treat rate limiting as pending and respect Retry-After when provided.
  if (response.status === 429) {
    return {
      status: 'pending',
      retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('Retry-After')),
    };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Device verification failed (${response.status}): ${text || 'unknown error'}`);
  }

  const data = await response.json() as Partial<DeviceAuthTokenResponse>;
  if (!data.authorization_code || !data.code_challenge || !data.code_verifier) {
    throw new Error('Invalid device verification response');
  }

  return {
    status: 'verified',
    authorizationCode: data.authorization_code,
    codeChallenge: data.code_challenge,
    codeVerifier: data.code_verifier,
  };
}

async function fetchWithRateLimitRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    const response = await fetch(url, init);
    if (response.status !== 429 || attempt >= maxRetries) {
      return response;
    }
    const retryAfter = Number(response.headers.get('Retry-After') || '0');
    const waitMs = Math.max(1000, (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 3000));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
}

function parseRetryAfterSeconds(raw: string | null): number {
  const parsed = Number(raw || '0');
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.ceil(parsed);
  }
  return 5;
}
