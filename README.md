# WhisperBox Client

Secure end-to-end encrypted messaging frontend for Stage 4B.

## Architecture

```text
Browser
├── Auth UI
├── Secure chat UI
├── Web Crypto API
│   ├── RSA-OAEP key generation
│   ├── PBKDF2-derived AES-GCM key wrapping
│   └── AES-GCM message encryption
├── IndexedDB
│   └── Non-extractable private CryptoKey
└── API / WebSocket client
    └── Encrypted payloads only

Backend
├── Authentication
├── User identities
├── Ciphertext storage
└── Encrypted key exchange
```

## Encryption Flow

1. Generate an RSA-OAEP key pair in the browser.
2. Derive a wrapping key from the user password using PBKDF2.
3. Wrap the private key with AES-GCM before sending the wrapped blob to the backend.
4. Store the private key securely as a `CryptoKey` in IndexedDB.
5. Encrypt each message with a fresh AES-GCM key and random IV.
6. Encrypt that AES key with the recipient public key and the sender public key.
7. Persist the encrypted message with `POST /messages`, then optionally emit the WebSocket `message.send` frame for real-time delivery.
8. Decrypt on the recipient device only.

## Key Management

- **Private key**: generated on the client and stored as a non-extractable `CryptoKey` in IndexedDB.
- **Public key**: exported and sent to the server at registration.
- **Session tokens**: stored in `sessionStorage`.
- **Message keys**: generated per message, never reused.

## Security Trade-offs

- Private keys persist locally in IndexedDB for usability.
- There is no message-level forward secrecy in this implementation.
- Replay protection is not fully enforced yet; server-side message IDs and timestamps should be validated.
- A production deployment should enforce HTTPS and WSS only.

## Known Limitations

- Conversation search and contact discovery are minimal.
- WebSocket behavior depends on backend support for the documented frame format.
- The app includes a mock API fallback for local development only.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set `VITE_USE_MOCK_API=true` for local demo mode, or `false` for the live backend.
3. Install dependencies.
4. Run `npm run dev`.

## Submission Notes

- Live backend base URL: `https://whisperbox.koyeb.app`
- Docs: `https://whisperbox.koyeb.app/docs#`
