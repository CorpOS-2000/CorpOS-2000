/**
 * Keep WebEx Publisher “Personal inventory” stockroom aligned with shop SKUs and carried items.
 */
import { patchState } from './gameState.js';

/**
 * @param {object} p Store product row (id, title, price, salePrice, categoryId, swatch, description, stockCount)
 */
export function syncShopProductRowToStockroom(p) {
  if (!p?.id) return;
  const id = `wxs-${p.id}`;
  patchState((s) => {
    if (!Array.isArray(s.player.webExStockroom)) s.player.webExStockroom = [];
    const room = s.player.webExStockroom;
    if (room.some((i) => i.id === id)) return s;
    room.push({
      id,
      sourceSku: p.id,
      title: p.title,
      price: p.price,
      salePrice: p.salePrice,
      categoryId: p.categoryId,
      swatch: p.swatch,
      description: p.description || '',
      stockCount: p.stockCount != null ? Number(p.stockCount) : 10
    });
    return s;
  });
}

/**
 * Ensure a carried inventory line exists as a draggable stockroom row; returns stockItemId (wxs-…).
 * @param {{ id: string, name: string, productRef?: string, unitValue?: number, category?: string, quantity?: number }} item
 */
export function ensureStockroomEntryForCarriedItem(item) {
  if (!item?.id) return null;
  const stockId = item.productRef ? `wxs-${item.productRef}` : `wxs-inv-${item.id}`;
  patchState((s) => {
    if (!Array.isArray(s.player.webExStockroom)) s.player.webExStockroom = [];
    const room = s.player.webExStockroom;
    if (room.some((i) => i.id === stockId)) return s;
    room.push({
      id: stockId,
      sourceSku: item.productRef || item.id,
      title: item.name,
      price: item.unitValue ?? 0,
      salePrice: item.unitValue ?? 0,
      categoryId: item.category || 'consumer',
      swatch: 'linear-gradient(145deg,#dfe8ff,#a8b8e8)',
      description: item.description || '',
      stockCount: item.quantity ?? 1,
      fromCarriedInventoryId: item.id
    });
    return s;
  });
  return stockId;
}
