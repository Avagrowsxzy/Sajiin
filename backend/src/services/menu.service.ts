import crypto from 'crypto';
import { CategoryRepository, CategoryEntity } from '../repositories/category.repository.js';
import { MenuRepository, MenuItemEntity, MenuFilterParams } from '../repositories/menu.repository.js';
import { writeAudit } from './audit.service.js';
import { PaginatedResponse } from '../types/index.js';

export class MenuService {
  constructor(
    private categoryRepo: CategoryRepository = new CategoryRepository(),
    private menuRepo: MenuRepository = new MenuRepository()
  ) {}

  // ===== KATEGORI =====

  async getAllCategories(): Promise<CategoryEntity[]> {
    return this.categoryRepo.findAll();
  }

  async getCategoryById(id: number): Promise<CategoryEntity | null> {
    return this.categoryRepo.findById(id);
  }

  async createCategory(
    name: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<CategoryEntity> {
    // Cek duplikat nama kategori
    const existing = await this.categoryRepo.findByName(name);
    if (existing) {
      throw {
        status: 400,
        code: 'CATEGORY_EXISTS',
        message: 'Kategori dengan nama tersebut sudah ada',
      };
    }

    const created = await this.categoryRepo.create(name);

    await writeAudit({
      actorId,
      action: 'CATEGORY_CHANGE',
      entity: 'categories',
      entity_id: String(created.id),
      new_value: { name: created.name },
      ipAddress,
    });

    return created;
  }

  async updateCategory(
    id: number,
    name: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<CategoryEntity> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Kategori tidak ditemukan' };
    }

    // Cek duplikat nama (kecuali nama sendiri)
    const duplicate = await this.categoryRepo.findByName(name);
    if (duplicate && duplicate.id !== id) {
      throw {
        status: 400,
        code: 'CATEGORY_EXISTS',
        message: 'Nama kategori sudah digunakan oleh kategori lain',
      };
    }

    const updated = await this.categoryRepo.update(id, name);
    if (!updated) {
      throw { status: 500, code: 'UPDATE_FAILED', message: 'Gagal memperbarui kategori' };
    }

    await writeAudit({
      actorId,
      action: 'CATEGORY_CHANGE',
      entity: 'categories',
      entity_id: String(id),
      old_value: { name: existing.name },
      new_value: { name: updated.name },
      ipAddress,
    });

    return updated;
  }

  async deleteCategory(
    id: number,
    actorId: string,
    ipAddress?: string | null
  ): Promise<void> {
    const existing = await this.categoryRepo.findById(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Kategori tidak ditemukan' };
    }

    // Cek apakah kategori memiliki menu
    const hasItems = await this.categoryRepo.hasMenuItems(id);
    if (hasItems) {
      throw {
        status: 400,
        code: 'CATEGORY_HAS_ITEMS',
        message: 'Kategori tidak bisa dihapus karena masih memiliki menu',
      };
    }

    const deleted = await this.categoryRepo.delete(id);
    if (!deleted) {
      throw { status: 500, code: 'DELETE_FAILED', message: 'Gagal menghapus kategori' };
    }

    await writeAudit({
      actorId,
      action: 'CATEGORY_CHANGE',
      entity: 'categories',
      entity_id: String(id),
      old_value: { name: existing.name },
      ipAddress,
    });
  }

  // ===== MENU (PUBLIK) =====

  async getPublicMenu(
    filters: MenuFilterParams
  ): Promise<PaginatedResponse<Omit<MenuItemEntity, 'created_by'>>> {
    const { data, total } = await this.menuRepo.findPublic(filters);
    // ponytail: strip internal audit columns from public view; expand allowlist if client needs more fields
    const sanitized = data.map((item) => {
      const copy = { ...item };
      delete (copy as { created_by?: string | null }).created_by;
      return copy;
    });
    return {
      data: sanitized,
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
      },
    };
  }

  async getPublicMenuById(id: string): Promise<Omit<MenuItemEntity, 'created_by'> | null> {
    const item = await this.menuRepo.findById(id);
    // Publik hanya bisa melihat menu yang tersedia
    if (!item || !item.is_available) {
      return null;
    }
    const sanitized = { ...item };
    delete (sanitized as { created_by?: string | null }).created_by;
    return sanitized;
  }

  // ===== MENU (ADMIN) =====

  async getAdminMenu(
    filters: MenuFilterParams
  ): Promise<PaginatedResponse<MenuItemEntity>> {
    const { data, total } = await this.menuRepo.findAdmin(filters);
    return {
      data,
      meta: {
        page: filters.page,
        limit: filters.limit,
        total,
      },
    };
  }

  async getMenuById(id: string): Promise<MenuItemEntity | null> {
    return this.menuRepo.findById(id);
  }

  async createMenu(
    input: {
      category_id: number;
      name: string;
      description?: string | null;
      price: number;
      stock: number;
      image_url?: string | null;
      is_available?: boolean;
    },
    actorId: string,
    ipAddress?: string | null
  ): Promise<MenuItemEntity> {
    // Validasi kategori exists
    const category = await this.categoryRepo.findById(input.category_id);
    if (!category) {
      throw {
        status: 400,
        code: 'INVALID_CATEGORY',
        message: 'Kategori tidak ditemukan',
      };
    }

    // Validasi harga & stok
    if (input.price < 0) {
      throw { status: 400, code: 'INVALID_PRICE', message: 'Harga tidak boleh negatif' };
    }
    if (input.stock < 0) {
      throw { status: 400, code: 'INVALID_STOCK', message: 'Stok tidak boleh negatif' };
    }

    const id = crypto.randomUUID();
    const created = await this.menuRepo.create(
      {
        id,
        ...input,
        created_by: actorId,
      }
    );

    await writeAudit({
      actorId,
      action: 'MENU_CREATE',
      entity: 'menu_items',
      entity_id: created.id,
      new_value: {
        name: created.name,
        category_id: created.category_id,
        price: created.price,
        stock: created.stock,
      },
      ipAddress,
    });

    return created;
  }

  async updateMenu(
    id: string,
    updates: Partial<{
      category_id: number;
      name: string;
      description: string | null;
      price: number;
      stock: number;
      image_url: string | null;
      is_available: boolean;
    }>,
    actorId: string,
    ipAddress?: string | null
  ): Promise<MenuItemEntity> {
    const existing = await this.menuRepo.findById(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Menu tidak ditemukan' };
    }

    // Validasi kategori jika diubah
    if (updates.category_id !== undefined) {
      const category = await this.categoryRepo.findById(updates.category_id);
      if (!category) {
        throw {
          status: 400,
          code: 'INVALID_CATEGORY',
          message: 'Kategori tidak ditemukan',
        };
      }
    }

    // Validasi harga & stok
    if (updates.price !== undefined && updates.price < 0) {
      throw { status: 400, code: 'INVALID_PRICE', message: 'Harga tidak boleh negatif' };
    }
    if (updates.stock !== undefined && updates.stock < 0) {
      throw { status: 400, code: 'INVALID_STOCK', message: 'Stok tidak boleh negatif' };
    }

    const updated = await this.menuRepo.update(id, updates);
    if (!updated) {
      throw { status: 500, code: 'UPDATE_FAILED', message: 'Gagal memperbarui menu' };
    }

    await writeAudit({
      actorId,
      action: 'MENU_UPDATE',
      entity: 'menu_items',
      entity_id: id,
      old_value: {
        name: existing.name,
        price: existing.price,
        stock: existing.stock,
        is_available: existing.is_available,
      },
      new_value: updates,
      ipAddress,
    });

    return updated;
  }

  async deleteMenu(
    id: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<{ hardDeleted: boolean }> {
    const existing = await this.menuRepo.findById(id);
    if (!existing) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Menu tidak ditemukan' };
    }

    const ordered = await this.menuRepo.isOrdered(id);
    const inCart = await this.menuRepo.isInCart(id);
    const canHardDelete = !ordered && !inCart;

    if (canHardDelete) {
      const deleted = await this.menuRepo.delete(id);
      if (!deleted) {
        throw { status: 500, code: 'DELETE_FAILED', message: 'Gagal menghapus menu' };
      }
    } else {
      // Riwayat order/cart masih mereferensikan menu; pertahankan row dan nonaktifkan.
      await this.menuRepo.softDelete(id);
    }

    await writeAudit({
      actorId,
      action: 'MENU_DELETE',
      entity: 'menu_items',
      entity_id: id,
      old_value: { name: existing.name, is_available: true },
      new_value: { is_available: false, hard_deleted: canHardDelete },
      ipAddress,
    });

    return { hardDeleted: canHardDelete };
  }
}
