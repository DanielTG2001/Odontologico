'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Package, AlertTriangle, MapPin } from 'lucide-react';

interface Location {
  id: string;
  code: string;
  name: string;
  type: string;
  chair?: { id: string; name: string };
  doctor?: { id: string; firstName: string; lastName: string };
}

interface StockRow {
  id: string;
  quantity: number;
  stockMin: number;
  item: { id: string; sku: string; name: string; unit: string; category?: string };
  location: { id: string; code: string; name: string; type: string };
}

interface Item {
  id: string;
  sku: string;
  name: string;
  category?: string;
  unit: string;
  stockMin: number;
  stockCurrent: number;
  costAverage: number;
  stocks?: { quantity: number; location: { id: string; name: string; code: string } }[];
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [stocks, setStocks] = useState<StockRow[]>([]);
  const [low, setLow] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    stockCurrent: 0,
    stockMin: 5,
    costAverage: 0,
  });
  const [locForm, setLocForm] = useState({
    code: '',
    name: '',
    type: 'WAREHOUSE',
  });
  const [move, setMove] = useState({
    itemId: '',
    type: 'IN',
    quantity: 1,
    reason: '',
    locationId: '',
    toLocationId: '',
  });
  const [setStockForm, setSetStockForm] = useState({
    itemId: '',
    locationId: '',
    quantity: 0,
    stockMin: 5,
  });

  async function load() {
    try {
      const [all, locs, stockRows, lowStock] = await Promise.all([
        api('/inventory/items'),
        api('/inventory/locations').catch(() => []),
        api('/inventory/stocks').catch(() => []),
        api(
          filterLocation
            ? `/inventory/items/low-stock?locationId=${filterLocation}`
            : '/inventory/items/low-stock',
        ).catch(() => []),
      ]);
      setItems(Array.isArray(all) ? all : []);
      setLocations(Array.isArray(locs) ? locs : []);
      setStocks(Array.isArray(stockRows) ? stockRows : []);
      setLow(Array.isArray(lowStock) ? lowStock : []);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterLocation]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/items', { method: 'POST', body: JSON.stringify(form) });
      setMessage('Insumo creado');
      setForm({ sku: '', name: '', category: '', stockCurrent: 0, stockMin: 5, costAverage: 0 });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function createLocation(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/locations', {
        method: 'POST',
        body: JSON.stringify(locForm),
      });
      setMessage('Ubicación creada');
      setLocForm({ code: '', name: '', type: 'WAREHOUSE' });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function addMovement(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const body: any = {
        itemId: move.itemId,
        type: move.type,
        quantity: move.quantity,
        reason: move.reason,
      };
      if (move.locationId) body.locationId = move.locationId;
      if (move.type === 'TRANSFER' && move.toLocationId) {
        body.toLocationId = move.toLocationId;
      }
      await api('/inventory/movements', { method: 'POST', body: JSON.stringify(body) });
      setMessage('Movimiento registrado');
      setMove({ itemId: '', type: 'IN', quantity: 1, reason: '', locationId: '', toLocationId: '' });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function applySetStock(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/inventory/stocks', {
        method: 'POST',
        body: JSON.stringify(setStockForm),
      });
      setMessage('Stock por ubicación actualizado');
      setSetStockForm({ itemId: '', locationId: '', quantity: 0, stockMin: 5 });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const typeLabel: Record<string, string> = {
    WAREHOUSE: 'Almacén',
    CHAIR: 'Sillón',
    PROFESSIONAL: 'Profesional',
    CONSULTORIO: 'Consultorio',
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Package className="h-7 w-7 text-clinical-600" /> Inventario
        </h1>
        <p className="page-subtitle">
          Stock multi-ubicación · por consultorio / sillón / profesional · movimientos · alertas
        </p>
      </div>

      {error && (
        <div className="alert-error">{error}</div>
      )}
      {message && (
        <div className="alert-success">{message}</div>
      )}

      {low.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {low.length} insumo(s) en o bajo stock mínimo
          {filterLocation ? ' en la ubicación filtrada' : ''}:{' '}
          {low.map((i) => i.name).join(', ')}
        </div>
      )}

      {/* Filtro por ubicación */}
      <div className="flex flex-wrap gap-3 items-center">
        <MapPin className="h-4 w-4 text-ink-500" />
        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          className="rounded-lg border border-ink-300 px-3 py-2 text-sm"
        >
          <option value="">Todas las ubicaciones (global)</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({typeLabel[l.type] || l.type})
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={createItem} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Nuevo insumo</h2>
          <input
            placeholder="SKU"
            required
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            className="input"
          />
          <input
            placeholder="Nombre"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
          />
          <input
            placeholder="Categoría"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="input"
          />
          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              placeholder="Stock"
              value={form.stockCurrent}
              onChange={(e) => setForm({ ...form, stockCurrent: Number(e.target.value) })}
              className="rounded border px-2 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Mín"
              value={form.stockMin}
              onChange={(e) => setForm({ ...form, stockMin: Number(e.target.value) })}
              className="rounded border px-2 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Costo"
              value={form.costAverage}
              onChange={(e) => setForm({ ...form, costAverage: Number(e.target.value) })}
              className="rounded border px-2 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-clinical-600 text-white py-2 text-sm font-medium"
          >
            Crear
          </button>
        </form>

        <form onSubmit={createLocation} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Nueva ubicación</h2>
          <input
            placeholder="Código (ej. SIL-1, ALM-01)"
            required
            value={locForm.code}
            onChange={(e) => setLocForm({ ...locForm, code: e.target.value })}
            className="input"
          />
          <input
            placeholder="Nombre"
            required
            value={locForm.name}
            onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
            className="input"
          />
          <select
            value={locForm.type}
            onChange={(e) => setLocForm({ ...locForm, type: e.target.value })}
            className="input"
          >
            <option value="WAREHOUSE">Almacén</option>
            <option value="CHAIR">Sillón</option>
            <option value="CONSULTORIO">Consultorio</option>
            <option value="PROFESSIONAL">Profesional</option>
          </select>
          <button
            type="submit"
            className="w-full rounded-lg border border-clinical-600 text-clinical-700 py-2 text-sm font-medium"
          >
            Crear ubicación
          </button>
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={addMovement} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Movimiento de stock</h2>
          <select
            required
            value={move.itemId}
            onChange={(e) => setMove({ ...move, itemId: e.target.value })}
            className="input"
          >
            <option value="">Insumo…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (global {i.stockCurrent})
              </option>
            ))}
          </select>
          <select
            value={move.type}
            onChange={(e) => setMove({ ...move, type: e.target.value })}
            className="input"
          >
            <option value="IN">Entrada (IN)</option>
            <option value="OUT">Salida (OUT)</option>
            <option value="ADJUST">Ajuste (+)</option>
            <option value="TRANSFER">Transferencia</option>
          </select>
          <select
            value={move.locationId}
            onChange={(e) => setMove({ ...move, locationId: e.target.value })}
            className="input"
          >
            <option value="">Ubicación (opcional / global)</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {move.type === 'TRANSFER' && (
            <select
              required
              value={move.toLocationId}
              onChange={(e) => setMove({ ...move, toLocationId: e.target.value })}
              className="input"
            >
              <option value="">Destino…</option>
              {locations
                .filter((l) => l.id !== move.locationId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
          )}
          <input
            type="number"
            min={1}
            value={move.quantity}
            onChange={(e) => setMove({ ...move, quantity: Number(e.target.value) })}
            className="input"
          />
          <input
            placeholder="Motivo"
            value={move.reason}
            onChange={(e) => setMove({ ...move, reason: e.target.value })}
            className="input"
          />
          <button
            type="submit"
            className="w-full rounded-lg border border-clinical-600 text-clinical-700 py-2 text-sm font-medium"
          >
            Registrar movimiento
          </button>
        </form>

        <form onSubmit={applySetStock} className="card p-4 space-y-3">
          <h2 className="font-semibold text-sm">Asignar stock a ubicación</h2>
          <select
            required
            value={setStockForm.itemId}
            onChange={(e) => setSetStockForm({ ...setStockForm, itemId: e.target.value })}
            className="input"
          >
            <option value="">Insumo…</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <select
            required
            value={setStockForm.locationId}
            onChange={(e) => setSetStockForm({ ...setStockForm, locationId: e.target.value })}
            className="input"
          >
            <option value="">Ubicación…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              placeholder="Cantidad"
              value={setStockForm.quantity}
              onChange={(e) =>
                setSetStockForm({ ...setStockForm, quantity: Number(e.target.value) })
              }
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={0}
              placeholder="Mínimo"
              value={setStockForm.stockMin}
              onChange={(e) =>
                setSetStockForm({ ...setStockForm, stockMin: Number(e.target.value) })
              }
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-clinical-600 text-white py-2 text-sm font-medium"
          >
            Guardar stock
          </button>
        </form>
      </div>

      {/* Stock por ubicación */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-ink-50 font-medium text-sm">
          Stock por ubicación
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-600">
            <tr>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="text-left px-4 py-2">Insumo</th>
              <th className="text-left px-4 py-2">Ubicación</th>
              <th className="text-left px-4 py-2">Tipo</th>
              <th className="text-right px-4 py-2">Stock</th>
              <th className="text-right px-4 py-2">Mín</th>
            </tr>
          </thead>
          <tbody>
            {stocks
              .filter((s) => !filterLocation || s.location.id === filterLocation)
              .map((s) => (
                <tr
                  key={s.id}
                  className={
                    'border-t ' + (s.quantity <= s.stockMin ? 'bg-amber-50' : '')
                  }
                >
                  <td className="px-4 py-2 font-mono text-xs">{s.item.sku}</td>
                  <td className="px-4 py-2">{s.item.name}</td>
                  <td className="px-4 py-2">{s.location.name}</td>
                  <td className="px-4 py-2 text-ink-500">
                    {typeLabel[s.location.type] || s.location.type}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{s.quantity}</td>
                  <td className="px-4 py-2 text-right text-ink-500">{s.stockMin}</td>
                </tr>
              ))}
            {stocks.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  Sin stock por ubicación. Crea ubicaciones y asigna cantidades.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Catálogo global */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-ink-50 font-medium text-sm">
          Catálogo de insumos (total global)
        </div>
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-600">
            <tr>
              <th className="text-left px-4 py-2">SKU</th>
              <th className="text-left px-4 py-2">Nombre</th>
              <th className="text-left px-4 py-2">Cat.</th>
              <th className="text-right px-4 py-2">Total</th>
              <th className="text-right px-4 py-2">Mín</th>
              <th className="text-left px-4 py-2">Ubicaciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr
                key={i.id}
                className={'border-t ' + (i.stockCurrent <= i.stockMin ? 'bg-amber-50' : '')}
              >
                <td className="px-4 py-2 font-mono text-xs">{i.sku}</td>
                <td className="px-4 py-2">{i.name}</td>
                <td className="px-4 py-2 text-ink-500">{i.category || '—'}</td>
                <td className="px-4 py-2 text-right font-medium">{i.stockCurrent}</td>
                <td className="px-4 py-2 text-right text-ink-500">{i.stockMin}</td>
                <td className="px-4 py-2 text-xs text-ink-500">
                  {(i.stocks || [])
                    .map((s) => `${s.location.code}:${s.quantity}`)
                    .join(' · ') || '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-400">
                  Sin insumos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
