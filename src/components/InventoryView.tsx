import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Edit3,
  PackagePlus,
  RefreshCw,
  ScanBarcode,
  Search,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import type { AlertNotification, Medicine, SupplierOrder } from '../types/pharmacy';
import {
  deleteMedicineBatch,
  disposeExpiredBatch,
  requestManualReorder,
} from '../services/pharmacyService';
import { classifyMedicine, formatCurrency } from '../utils/inventoryLogic';
import { StatusIndicator } from './StatusIndicator';

interface InventoryViewProps {
  ownerId: string;
  medicines: Medicine[];
  orders: SupplierOrder[];
  notifications: AlertNotification[];
  expiryAlertDays: number;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenAddMedicine: () => void;
  onOpenScanIntake: () => void;
  onOpenEditMedicine: (med: Medicine) => void;
  onOpenDispense: (medicineId: string) => void;
}

type FilterKey = 'all' | 'sufficient' | 'low_stock' | 'expiring_soon' | 'expired';

export function InventoryView({
  ownerId,
  medicines,
  orders,
  notifications,
  expiryAlertDays,
  searchQuery,
  onSearchChange,
  onOpenAddMedicine,
  onOpenScanIntake,
  onOpenEditMedicine,
  onOpenDispense,
}: InventoryViewProps) {
  const [statusFilter, setStatusFilter] = useState<FilterKey>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classified = useMemo(
    () => medicines.map((m) => classifyMedicine(m, expiryAlertDays)),
    [medicines, expiryAlertDays]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classified.filter((item) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'low_stock' && !item.isLowStock) return false;
        if (statusFilter === 'expiring_soon' && !item.isExpiringSoon) return false;
        if (statusFilter === 'expired' && !item.isExpired) return false;
        if (statusFilter === 'sufficient' && item.primaryStatus !== 'sufficient') return false;
      }
      if (!q) return true;
      const m = item.medicine;
      return (
        m.name.toLowerCase().includes(q) ||
        m.barcode.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        m.supplierName.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      );
    });
  }, [classified, searchQuery, statusFilter]);

  const availableRows = filtered.filter((c) => !c.isExpired);
  const expiredRows = filtered.filter((c) => c.isExpired);

  const handleManualReorder = async (med: Medicine) => {
    setError(null);
    setFeedback(null);
    setBusyId(med.id);
    try {
      const suggested = Math.max(med.minStockLevel * 3, 25);
      await requestManualReorder(ownerId, med, suggested);
      setFeedback(`Reorder approval request created for ${med.name} (${suggested} units).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to queue reorder.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDispose = async (med: Medicine) => {
    setError(null);
    setFeedback(null);
    setBusyId(med.id);
    try {
      await disposeExpiredBatch(ownerId, med, notifications);
      setFeedback(`Expired batch ${med.batchNumber} (${med.name}) disposed and quarantined.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to dispose expired batch.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (med: Medicine) => {
    setError(null);
    setFeedback(null);
    setBusyId(med.id);
    try {
      await deleteMedicineBatch(ownerId, med.id);
      setFeedback(`Removed ${med.name} (Batch ${med.batchNumber}) from inventory.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete batch.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar: Search + Segmented Status Filter + Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search medicine name, barcode, batch, or supplier..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenScanIntake}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap"
            >
              <ScanBarcode className="w-4 h-4" />
              Scan Barcode
            </button>
            <button
              type="button"
              onClick={onOpenAddMedicine}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <PackagePlus className="w-4 h-4" />
              Add Medicine
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(
            [
              { key: 'all', label: `All (${classified.length})` },
              {
                key: 'sufficient',
                label: `Sufficient (${classified.filter((c) => c.primaryStatus === 'sufficient').length})`,
              },
              {
                key: 'low_stock',
                label: `Low Stock (${classified.filter((c) => c.isLowStock).length})`,
              },
              {
                key: 'expiring_soon',
                label: `Nearing Expiry (${classified.filter((c) => c.isExpiringSoon).length})`,
              },
              {
                key: 'expired',
                label: `Expired (${classified.filter((c) => c.isExpired).length})`,
              },
            ] as { key: FilterKey; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 font-medium">
          {feedback}
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Available (Non-Expired) Stock Table */}
      {statusFilter !== 'expired' && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Available Medicine Inventory
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active, non-expired batches eligible for dispensing.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {availableRows.length} batches
            </span>
          </div>

          {availableRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No active medicines match your current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Medicine & Category</th>
                    <th className="py-3 px-4">Barcode / Batch</th>
                    <th className="py-3 px-4">Mfg / Expiry</th>
                    <th className="py-3 px-4 text-right">Stock / Min</th>
                    <th className="py-3 px-4 text-right">Unit Price</th>
                    <th className="py-3 px-4">Supplier</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {availableRows.map((item) => {
                    const m = item.medicine;
                    const hasOpenOrder = orders.some(
                      (o) =>
                        o.medicineId === m.id &&
                        (o.status === 'pending_approval' ||
                          o.status === 'ordered' ||
                          o.status === 'in_transit')
                    );
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900">{m.name}</p>
                          <p className="text-xs text-slate-500">{m.category}</p>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-700">
                          <p>{m.barcode}</p>
                          <p className="text-slate-500">Batch {m.batchNumber}</p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700">
                          <p className="text-slate-500">{m.manufacturingDate}</p>
                          <p className={item.isExpiringSoon ? 'text-orange-700 font-semibold' : ''}>
                            Exp: {m.expiryDate} ({item.daysUntilExpiry}d)
                          </p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <p
                            className={`font-semibold ${
                              item.isLowStock ? 'text-amber-800' : 'text-slate-900'
                            }`}
                          >
                            {m.quantity}
                          </p>
                          <p className="text-xs text-slate-500">Min {m.minStockLevel}</p>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                          {formatCurrency(m.unitPrice)}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          <p className="font-medium text-slate-900">{m.supplierName}</p>
                          <p className="text-slate-500 truncate max-w-[160px]">
                            {m.supplierPhone || m.supplierEmail || 'Registered'}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            <StatusIndicator
                              severity={item.severity}
                              label={item.statusLabel}
                              compact
                            />
                            {item.isExpiringSoon && item.isLowStock && (
                              <div>
                                <StatusIndicator
                                  severity="yellow"
                                  label="Low Stock"
                                  compact
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={m.quantity <= 0}
                              onClick={() => onOpenDispense(m.id)}
                              title="Dispense / Record Sale"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md disabled:opacity-40 whitespace-nowrap"
                            >
                              <ShoppingBag className="w-3.5 h-3.5" />
                              Sell
                            </button>
                            {!hasOpenOrder && (
                              <button
                                type="button"
                                disabled={busyId === m.id}
                                onClick={() => void handleManualReorder(m)}
                                title="Queue Reorder Request"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 rounded-md disabled:opacity-40 whitespace-nowrap"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Reorder
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenEditMedicine(m)}
                              aria-label={`Edit ${m.name}`}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void handleDelete(m)}
                              aria-label={`Delete ${m.name}`}
                              className="p-1.5 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-md"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Separated Expired / Quarantined Stock Section */}
      {(expiredRows.length > 0 || statusFilter === 'expired') && (
        <section className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-red-200 bg-red-50/50 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-red-900">
                  Expired & Quarantined Batches (Separated from Available Stock)
                </h2>
                <p className="text-xs text-red-700 mt-0.5">
                  Dispensing and sales are permanently blocked for expired medicine batches.
                </p>
              </div>
            </div>
            <span className="text-xs font-mono tabular-nums text-red-700">
              {expiredRows.length} batches
            </span>
          </div>

          {expiredRows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No expired batches found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Medicine</th>
                    <th className="py-3 px-4">Barcode / Batch</th>
                    <th className="py-3 px-4">Expiry Date</th>
                    <th className="py-3 px-4 text-right">Quarantined Qty</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {expiredRows.map((item) => {
                    const m = item.medicine;
                    return (
                      <tr key={m.id} className="bg-red-50/20">
                        <td className="py-3 px-4 font-semibold text-slate-900">{m.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">
                          {m.barcode} · Batch {m.batchNumber}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-red-700 font-semibold">
                          {m.expiryDate}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700 font-semibold">
                          {m.quantity}
                        </td>
                        <td className="py-3 px-4">
                          <StatusIndicator severity="red" label={item.statusLabel} compact />
                        </td>
                        <td className="py-3 px-4 text-right">
                          {!m.disposed ? (
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void handleDispose(m)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Dispose Expired Stock
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyId === m.id}
                              onClick={() => void handleDelete(m)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                            >
                              Remove Record
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
