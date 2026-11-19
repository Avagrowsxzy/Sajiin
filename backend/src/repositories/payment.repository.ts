import mysql from 'mysql2/promise';
import { appPool } from '../config/database.js';
import { PaymentStatus } from '../types/index.js';

export interface PaymentEntity {
  id: string;
  order_id: string;
  gateway_ref: string | null;
  method: string | null;
  amount: number;
  status: PaymentStatus;
  paid_at: Date | null;
  proof_path: string | null;
  proof_mime: string | null;
  proof_uploaded_at: Date | null;
  created_at: Date;
}

export class PaymentRepository {
  constructor(private pool: mysql.Pool = appPool) {}

  async create(
    data: {
      id: string;
      order_id: string;
      amount: number;
      gateway_ref?: string | null;
      method?: string | null;
    },
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      `INSERT INTO payments (id, order_id, amount, gateway_ref, method)
       VALUES (?, ?, ?, ?, ?)`,
      [data.id, data.order_id, data.amount, data.gateway_ref ?? null, data.method ?? null]
    );
  }

  async findByOrderId(orderId: string, conn?: mysql.Connection): Promise<PaymentEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT * FROM payments WHERE order_id = ?',
      [orderId]
    );
    if (rows.length === 0) return null;
    return this.map(rows[0]);
  }

  async findById(id: string, conn?: mysql.Connection): Promise<PaymentEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT * FROM payments WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return null;
    return this.map(rows[0]);
  }

  async findByGatewayRef(ref: string, conn?: mysql.Connection): Promise<PaymentEntity | null> {
    const executor = conn || this.pool;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT * FROM payments WHERE gateway_ref = ?',
      [ref]
    );
    if (rows.length === 0) return null;
    return this.map(rows[0]);
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    paidAt?: Date | null,
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    if (paidAt) {
      await executor.query(
        'UPDATE payments SET status = ?, paid_at = ? WHERE id = ?',
        [status, paidAt, id]
      );
    } else {
      await executor.query(
        'UPDATE payments SET status = ? WHERE id = ?',
        [status, id]
      );
    }
  }

  async updateGatewayRef(
    id: string,
    gatewayRef: string,
    method: string,
    conn?: mysql.Connection
  ): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE payments SET gateway_ref = ?, method = ? WHERE id = ?',
      [gatewayRef, method, id]
    );
  }

  async updateProof(id: string, path: string, mime: string, conn?: mysql.Connection): Promise<void> {
    const executor = conn || this.pool;
    await executor.query(
      'UPDATE payments SET proof_path = ?, proof_mime = ?, proof_uploaded_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      [path, mime, id]
    );
  }

  async findAll(
    page: number = 1,
    limit: number = 20,
    conn?: mysql.Connection
  ): Promise<{ data: PaymentEntity[]; total: number }> {
    const executor = conn || this.pool;
    const [countRows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) as total FROM payments'
    );
    const total = Number(countRows[0].total);
    const offset = (page - 1) * limit;
    const [rows] = await executor.query<mysql.RowDataPacket[]>(
      'SELECT * FROM payments ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    return { data: rows.map(this.map), total };
  }

  private map(row: mysql.RowDataPacket): PaymentEntity {
    return {
      id: row.id,
      order_id: row.order_id,
      gateway_ref: row.gateway_ref,
      method: row.method,
      amount: Number(row.amount),
      status: row.status as PaymentStatus,
      paid_at: row.paid_at ? new Date(row.paid_at) : null,
      proof_path: row.proof_path || null,
      proof_mime: row.proof_mime || null,
      proof_uploaded_at: row.proof_uploaded_at ? new Date(row.proof_uploaded_at) : null,
      created_at: new Date(row.created_at),
    };
  }
}
