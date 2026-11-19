import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MenuService } from '../services/menu.service.js';

const menuService = new MenuService();

// Skema validasi Zod
const categoryCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Nama kategori minimal 2 karakter')
    .max(80)
    .refine((v) => !/[<>]/.test(v), 'Nama kategori tidak boleh mengandung karakter < atau >'),
});

const categoryUpdateSchema = categoryCreateSchema;

const menuCreateSchema = z.object({
  category_id: z.number().int().positive('Kategori ID harus positif'),
  name: z
    .string()
    .trim()
    .min(2, 'Nama menu minimal 2 karakter')
    .max(120)
    .refine((v) => !/[<>]/.test(v), 'Nama menu tidak boleh mengandung karakter < atau >'),
  description: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !/[<>]/.test(v), 'Deskripsi tidak boleh mengandung karakter < atau >')
    .optional()
    .nullable(),
  price: z.number().nonnegative('Harga tidak boleh negatif'),
  stock: z.number().int().nonnegative('Stok tidak boleh negatif'),
  image_url: z.string().url('URL gambar tidak valid').max(255).optional().nullable(),
  is_available: z.boolean().optional(),
});

const menuUpdateSchema = z.object({
  category_id: z.number().int().positive().optional(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .refine((v) => !/[<>]/.test(v), 'Nama menu tidak boleh mengandung karakter < atau >')
    .optional(),
  description: z
    .string()
    .trim()
    .max(1000)
    .refine((v) => !/[<>]/.test(v), 'Deskripsi tidak boleh mengandung karakter < atau >')
    .optional()
    .nullable(),
  price: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  image_url: z.string().url().max(255).optional().nullable(),
  is_available: z.boolean().optional(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category_id: z.coerce.number().int().positive().optional(),
  q: z.string().max(100).optional(),
});

export class MenuController {
  // ===== KATEGORI (PUBLIK) =====
  async getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = await menuService.getAllCategories();
      res.status(200).json({ data: categories });
    } catch (err) {
      next(err);
    }
  }

  // ===== MENU (PUBLIK) =====
  async getPublicMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Parameter tidak valid',
          },
        });
        return;
      }

      const result = await menuService.getPublicMenu(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getPublicMenuById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const item = await menuService.getPublicMenuById(id);
      if (!item) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Menu tidak ditemukan' },
        });
        return;
      }
      res.status(200).json({ data: item });
    } catch (err) {
      next(err);
    }
  }

  // ===== ADMIN: KATEGORI =====
  async createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = categoryCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const created = await menuService.createCategory(
        parsed.data.name,
        req.user.userId,
        req.ip
      );
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }

  async updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const parsed = categoryUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const updated = await menuService.updateCategory(
        Number(id),
        parsed.data.name,
        req.user.userId,
        req.ip
      );
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      await menuService.deleteCategory(Number(id), req.user.userId, req.ip);
      res.status(200).json({ data: { message: 'Kategori berhasil dihapus' } });
    } catch (err) {
      next(err);
    }
  }

  // ===== ADMIN: MENU =====
  async getAdminMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Parameter tidak valid',
          },
        });
        return;
      }

      const result = await menuService.getAdminMenu(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async getMenuById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const item = await menuService.getMenuById(id);
      if (!item) {
        res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Menu tidak ditemukan' },
        });
        return;
      }
      res.status(200).json({ data: item });
    } catch (err) {
      next(err);
    }
  }

  async createMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const parsed = menuCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const created = await menuService.createMenu(parsed.data, req.user.userId, req.ip);
      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }

  async updateMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const parsed = menuUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Input tidak valid',
          },
        });
        return;
      }

      const updated = await menuService.updateMenu(id, parsed.data, req.user.userId, req.ip);
      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  async deleteMenu(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Otentikasi diperlukan' } });
        return;
      }

      const { id } = req.params;
      const result = await menuService.deleteMenu(id, req.user.userId, req.ip);
      res.status(200).json({
        data: {
          message: result.hardDeleted
            ? 'Menu berhasil dihapus permanen'
            : 'Menu sudah pernah dipakai dan dinonaktifkan',
          hard_deleted: result.hardDeleted,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
