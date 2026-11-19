import { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiClient } from '../lib/api-client';
import { useAuth } from '../hooks/useAuth';
import type { Cart, CartItem } from '../types';

interface CartContextType {
  cart: Cart | null;
  itemCount: number;
  loading: boolean;
  fetchCart: () => Promise<void>;
  updateItemQuantity: (menuItemId: string, quantity: number) => Promise<void>;
  removeItem: (menuItemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchCart = useCallback(async () => {
    if (!user || user.role_name !== 'user') {
      setCart(null);
      return;
    }

    try {
      setLoading(true);
      const res = await apiClient.get<{ data: { items: CartItem[]; total: number } }>('/me/cart');
      setCart(res.data);
    } catch (err) {
      console.error('Failed to load cart:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const updateItemQuantity = async (menuItemId: string, quantity: number) => {
    const res = await apiClient.put<{ data: { items: CartItem[]; total: number } }>(
      `/me/cart/items/${menuItemId}`,
      { quantity }
    );
    setCart(res.data);
  };

  const removeItem = async (menuItemId: string) => {
    await updateItemQuantity(menuItemId, 0);
  };

  const clearCart = async () => {
    await apiClient.delete('/me/cart');
    setCart({ items: [], total: 0 });
  };

  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        itemCount,
        loading,
        fetchCart,
        updateItemQuantity,
        removeItem,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}
