export interface EncryptedData {
  iv: string
  ciphertext: string
  authTag: string
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) arr[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  return arr
}

function toBase64(bytes: ArrayBuffer): string {
  let binary = ''
  const arr = new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i])
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return arr
}

async function importKey(hexKey: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', hexToBytes(hexKey), {name: 'AES-GCM'}, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function encrypt(plaintext: string, hexKey: string): Promise<EncryptedData> {
  const key = await importKey(hexKey)
  const iv = new Uint8Array(12)
  crypto.getRandomValues(iv)
  const encoded = new TextEncoder().encode(plaintext)
  const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv, tagLength: 128}, key, encoded)
  // AES-GCM in Web Crypto appends the 16-byte auth tag at the end of the ciphertext
  const ciphertextWithTag = new Uint8Array(encrypted)
  const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16)
  const authTag = ciphertextWithTag.slice(ciphertextWithTag.length - 16)
  return {iv: toBase64(iv), ciphertext: toBase64(ciphertext), authTag: toBase64(authTag)}
}

export async function decrypt(data: EncryptedData, hexKey: string): Promise<string> {
  const key = await importKey(hexKey)
  const iv = fromBase64(data.iv)
  const ciphertext = fromBase64(data.ciphertext)
  const authTag = fromBase64(data.authTag)
  // Reassemble ciphertext+authTag for Web Crypto
  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)
  const decrypted = await crypto.subtle.decrypt({name: 'AES-GCM', iv, tagLength: 128}, key, combined)
  return new TextDecoder().decode(decrypted)
}
