import { encryptField, decryptField, hashPassword, verifyPassword, hashToken } from '../src/utils/crypto.js';

describe('Crypto Utility Tests', () => {
  describe('AES-256-GCM Column Encryption', () => {
    it('harus mengenkripsi dan mendekripsi string dengan benar', () => {
      const plaintext = '081234567890';
      const encrypted = encryptField(plaintext);

      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
      // Format simpan: base64(iv):base64(ciphertext):base64(authTag)
      expect(encrypted?.split(':').length).toBe(3);

      const decrypted = decryptField(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('harus menghasilkan ciphertext berbeda untuk plaintext yang sama (karena random IV)', () => {
      const text = 'Jalan Jenderal Sudirman No. 123';
      const enc1 = encryptField(text);
      const enc2 = encryptField(text);

      expect(enc1).not.toBe(enc2);
      expect(decryptField(enc1)).toBe(text);
      expect(decryptField(enc2)).toBe(text);
    });

    it('harus mengembalikan null untuk nilai null atau undefined', () => {
      expect(encryptField(null)).toBeNull();
      expect(encryptField(undefined)).toBeNull();
      expect(decryptField(null)).toBeNull();
      expect(decryptField(undefined)).toBeNull();
    });

    it('harus melempar error jika authTag atau ciphertext dimanipulasi', () => {
      const plaintext = 'Data rahasia';
      const encrypted = encryptField(plaintext)!;
      const parts = encrypted.split(':');
      // Rusak ciphertext
      parts[1] = Buffer.from('manipulated').toString('base64');
      const tampered = parts.join(':');

      expect(() => decryptField(tampered)).toThrow();
    });
  });

  describe('Native scrypt Password Hashing', () => {
    it('harus menghash dan memverifikasi password dengan benar', async () => {
      const password = 'SuperSecretPassword123!';
      const hash = await hashPassword(password);

      expect(hash).toContain('scrypt$');
      const isValid = await verifyPassword(hash, password);
      expect(isValid).toBe(true);

      const isInvalid = await verifyPassword(hash, 'WrongPassword123!');
      expect(isInvalid).toBe(false);
    });
  });

  describe('SHA-256 Token Hashing', () => {
    it('harus menghasilkan hash hex 64-karakter yang konsisten', () => {
      const token = 'random_refresh_token_string';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
      expect(/^[0-9a-f]{64}$/.test(hash1)).toBe(true);
    });
  });
});
