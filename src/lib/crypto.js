const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const PBKDF2_ITERATIONS = 310000;
const SALT_BYTES = 16;

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const normalized = String(base64)
    .trim()
    .replace(/^data:.*?;base64,/, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function getRandomBase64(bytesLength = 16) {
  return bufferToBase64(window.crypto.getRandomValues(new Uint8Array(bytesLength)));
}

export async function generateRSAKeyPair() {
  return window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function exportPublicKey(publicKey) {
  const exported = await window.crypto.subtle.exportKey('spki', publicKey);
  return bufferToBase64(exported);
}

export async function importPublicKey(base64spki) {
  return window.crypto.subtle.importKey(
    'spki',
    base64ToBuffer(base64spki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
}

export function generateSalt() {
  return bufferToBase64(window.crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

export async function deriveWrappingKey(password, saltBase64) {
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: base64ToBuffer(saltBase64),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapPrivateKey(privateKey, wrappingKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const exported = await window.crypto.subtle.exportKey('pkcs8', privateKey);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, exported);

  return JSON.stringify({
    alg: 'AES-GCM',
    iv: bufferToBase64(iv),
    wrapped: bufferToBase64(ciphertext),
  });
}

export async function unwrapPrivateKey(wrappedBase64, wrappingKey) {
  let payload = wrappedBase64;

  if (typeof wrappedBase64 === 'string') {
    try {
      payload = JSON.parse(wrappedBase64);
    } catch {
      payload = wrappedBase64;
    }
  }

  if (payload && typeof payload === 'object' && payload.iv && payload.wrapped) {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(payload.iv) },
      wrappingKey,
      base64ToBuffer(payload.wrapped)
    );

    return window.crypto.subtle.importKey(
      'pkcs8',
      decrypted,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
  }

  try {
    return await window.crypto.subtle.unwrapKey(
      'pkcs8',
      base64ToBuffer(String(payload)),
      wrappingKey,
      { name: 'AES-KW' },
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['decrypt']
    );
  } catch (error) {
    throw new Error('Unable to unwrap private key. Existing wrapped data may be from the old AES-KW format and need re-registration.');
  }
}

export async function encryptMessage(plaintext, recipientPublicKey, senderPublicKey) {
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedMessage = TEXT_ENCODER.encode(plaintext);

  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encodedMessage);
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

  const encryptedKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientPublicKey, rawAesKey);
  const encryptedKeyForSelf = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, senderPublicKey, rawAesKey);

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    encryptedKey: bufferToBase64(encryptedKey),
    encryptedKeyForSelf: bufferToBase64(encryptedKeyForSelf),
  };
}

export async function decryptMessage(payload, privateKey) {
  try {
    const encryptedKeyBase64 = payload.encryptedKeyForSelf || payload.encryptedKey;
    const rawAesKey = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      base64ToBuffer(encryptedKeyBase64)
    );

    const aesKey = await window.crypto.subtle.importKey('raw', rawAesKey, { name: 'AES-GCM' }, false, ['decrypt']);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(payload.iv) },
      aesKey,
      base64ToBuffer(payload.ciphertext)
    );

    return TEXT_DECODER.decode(decrypted);
  } catch (error) {
    console.error('Decryption failed', error);
    return '[Unable to decrypt message]';
  }
}
