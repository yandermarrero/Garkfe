export async function hashPassword(password: string): Promise<string> {
  if (!window.crypto || !window.crypto.subtle) {
    console.error('Web Crypto API (crypto.subtle) is not available. Authentication will fail.');
    throw new Error('Tu navegador no soporta las funciones de seguridad necesarias (Web Crypto API). Por favor, usa un navegador moderno como Chrome o Firefox.');
  }
  const msgUint8 = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const hashed = await hashPassword(password);
  return hashed === hash;
}
