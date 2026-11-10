import QRCode from 'qrcode';
import crypto from 'crypto';
import { JWT_SECRET } from '../config/env.js';

/**
 * Deterministically serialize payload object for HMAC signing.
 */
function canonicalString(obj) {
  if (typeof obj !== 'object' || obj === null) return String(obj);
  const keys = Object.keys(obj).filter(k => k !== 'signature').sort();
  const sortedObj = {};
  keys.forEach(k => { sortedObj[k] = obj[k]; });
  return JSON.stringify(sortedObj);
}

/**
 * Generate HMAC-SHA256 signature for a payload object or string.
 */
export const signPayload = (payload, secret = JWT_SECRET) => {
  const content = typeof payload === 'string' ? payload : canonicalString(payload);
  return crypto.createHmac('sha256', secret).update(content).digest('hex');
};

/**
 * Verify HMAC-SHA256 signature with constant-time comparison to prevent timing attacks.
 */
export const verifyPayload = (payloadWithSignature, secret = JWT_SECRET) => {
  try {
    if (!payloadWithSignature || typeof payloadWithSignature !== 'object') return false;
    const { signature } = payloadWithSignature;
    if (!signature || typeof signature !== 'string') return false;

    const expected = signPayload(payloadWithSignature, secret);
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');

    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
};

/**
 * Generate standard Base64 Data URL for a QR code.
 */
export const generateBase64QR = async (dataContent) => {
  try {
    const content = typeof dataContent === 'string' ? dataContent : JSON.stringify(dataContent);
    const dataUri = await QRCode.toDataURL(content, {
      errorCorrectionLevel: 'M',
      margin: 3,
      scale: 8,
      color: {
        dark: '#000000',
        light: '#ffffff',
      }
    });
    return dataUri;
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
};

/**
 * Sign payload with HMAC and generate a tamper-evident QR code.
 */
export const generateSignedQR = async (payload, secret = JWT_SECRET) => {
  const signature = signPayload(payload, secret);
  const signedData = {
    ...payload,
    signature,
    signed_at: new Date().toISOString(),
  };
  const qrImage = await generateBase64QR(JSON.stringify(signedData));
  return {
    qrImage,
    signature,
    signedData,
  };
};

export default {
  signPayload,
  verifyPayload,
  generateBase64QR,
  generateSignedQR,
};
