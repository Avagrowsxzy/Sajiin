import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import { hashPassword } from '../src/utils/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(__dirname, '../../.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function seed() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = Number(process.env.DB_PORT) || 3306;
  const user = process.env.DB_MIGRATOR_USER || 'migrator';
  const password = process.env.DB_MIGRATOR_PASSWORD;
  const database = process.env.DB_NAME || 'foodorder';
  const adminUsername = (process.env.ADMIN_SEED_USERNAME || process.env.ADMIN_SEED_EMAIL || 'admin').split('@')[0].trim().toLowerCase();

  console.log(`Connecting to ${database} to seed initial data...`);
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  try {
    // 1. Cek apakah admin sudah ada
    const [existing] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT id FROM users WHERE username = ?',
      [adminUsername]
    );

    let adminId: string;

    if (existing.length === 0) {
      const adminPassword = process.env.ADMIN_SEED_PASSWORD || crypto.randomBytes(16).toString('base64url') + '!1Aa';
      console.log(`Creating initial admin (${adminUsername})...`);
      if (!process.env.ADMIN_SEED_PASSWORD) {
        console.log(`Generated Admin Password: ${adminPassword}`);
      }
      const passwordHash = await hashPassword(adminPassword);

      adminId = crypto.randomUUID();

      await connection.query(
        `INSERT INTO users (id, role_id, full_name, username, password_hash, is_active)
         VALUES (?, 1, 'Administrator', ?, ?, 1)`,
        [adminId, adminUsername, passwordHash]
      );

      // Audit log untuk pembuatan admin seed
      await connection.query(
        `INSERT INTO audit_logs (actor_id, action, entity, entity_id, new_value)
         VALUES (?, 'AUTH_REGISTER', 'users', ?, ?)`,
        [
          adminId,
          adminId,
          JSON.stringify({ username: adminUsername, role: 'admin', reason: 'initial_seed' }),
        ]
      );
      console.log('Admin account created successfully.');
    } else {
      adminId = existing[0].id;
      console.log(`Admin account (${adminUsername}) already exists. Skipped.`);
    }

    // 2. Sample data kategori & menu untuk development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Seeding sample categories and menu items for development...');

      const sampleCategories = [
        { id: 1, name: 'Makanan Utama' },
        { id: 2, name: 'Minuman' },
        { id: 3, name: 'Camilan' },
      ];

      for (const cat of sampleCategories) {
        await connection.query(
          'INSERT IGNORE INTO categories (id, name) VALUES (?, ?)',
          [cat.id, cat.name]
        );
      }

      const sampleMenuItems = [
        {
          id: crypto.randomUUID(),
          category_id: 1,
          name: 'Nasi Goreng Spesial',
          description: 'Nasi goreng dengan telur mata sapi, ayam suwir, dan kerupuk',
          price: 25000.0,
          stock: 50,
          is_available: 1,
        },
        {
          id: crypto.randomUUID(),
          category_id: 1,
          name: 'Mie Ayam Bakso',
          description: 'Mie ayam kenyal dengan bakso sapi gurih dan pangsit goreng',
          price: 22000.0,
          stock: 40,
          is_available: 1,
        },
        {
          id: crypto.randomUUID(),
          category_id: 1,
          name: 'Ayam Bakar Madu',
          description: 'Ayam bakar dengan bumbu madu gurih manis disajikan bersama sambal',
          price: 30000.0,
          stock: 30,
          is_available: 1,
        },
        {
          id: crypto.randomUUID(),
          category_id: 2,
          name: 'Es Teh Manis',
          description: 'Teh melati segar dengan gula asli dan es batu',
          price: 5000.0,
          stock: 100,
          is_available: 1,
        },
        {
          id: crypto.randomUUID(),
          category_id: 2,
          name: 'Jus Alpukat',
          description: 'Jus alpukat kental dengan saus cokelat manis',
          price: 15000.0,
          stock: 35,
          is_available: 1,
        },
        {
          id: crypto.randomUUID(),
          category_id: 3,
          name: 'Pisang Goreng Keju',
          description: 'Pisang goreng renyah ditaburi keju parut dan susu kental manis',
          price: 12000.0,
          stock: 25,
          is_available: 1,
        },
      ];

      for (const item of sampleMenuItems) {
        // Cek apakah menu item dengan nama yang sama sudah ada
        const [found] = await connection.query<mysql.RowDataPacket[]>(
          'SELECT id FROM menu_items WHERE name = ?',
          [item.name]
        );
        if (found.length === 0) {
          await connection.query(
            `INSERT INTO menu_items (id, category_id, name, description, price, stock, is_available, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              item.id,
              item.category_id,
              item.name,
              item.description,
              item.price,
              item.stock,
              item.is_available,
              adminId,
            ]
          );
        }
      }
      console.log('Sample menu items seeded.');
    }

    console.log('Seed completed successfully.');
  } finally {
    await connection.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
