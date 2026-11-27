import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, ScanBarcode, ShoppingBag, X } from 'lucide-react';
import type { Medicine, SupplierOrder } from '../types/pharmacy';
import { dispenseMedicineSale } from '../services/pharmacyService';
import { classifyMedicine, formatCurrency } from '../utils/inventoryLogic';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface DispenseSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  medicines: Medicine[];
  orders: SupplierOrder[];
  expiryAlertDays: number;
  initialMedicineId?: string | null;
}

export function DispenseSaleModal({
  isOpen,
  onClose,
  ownerId,
  medicines,
  orders,
  expiryAlertDays,
  initialMedicineId = null,
}: DispenseSaleModalProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [sellQty, setSellQty] = useState<string>('1');
  const [note, setNote] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const classifiedList = useMemo(
    () =>
      medicines
        .filter((m) => !m.disposed)
        .map((m) => classifyMedicine(m, expiryAlertDays))
        .sort((a, b) => Number(a.isExpired) - Number(b.isExpired) || a.medicine.name.localeCompare(b.medicine.name)),
    [medicines, expiryAlertDays]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSellQty('1');
    setNote('');
    if (initialMedicineId) {
      setSelectedId(initialMedicineId);
    } else {
      const firstSellable = classifiedList.find((c) => !c.isExpired && c.medicine.quantity > 0);
      setSelectedId(firstSellable?.medicine.id || classifiedList[0]?.medicine.id || '');
    }
  }, [isOpen, initialMedicineId, classifiedList]);

  const selected = useMemo(
    () => classifiedList.find((c) => c.medicine.id === selectedId) || null,
    [classifiedList, selectedId]
  );

  const handleBarcodeMatch = (barcode: string) => {
    setError(null);
    const matching = classifiedList.filter(
      (c) => c.medicine.barcode.toLowerCase() === barcode.toLowerCase()
    );
    if (matching.length === 0) {
      setError(`No medicine batch found with barcode "${barcode}".`);
      return;
    }
    const sellable = matching.find((m) => !m.isExpired && m.medicine.quantity > 0) || matching[0];
    setSelectedId(sellable.medicine.id);
  };

  const qtyNum = Math.max(0, Math.round(Number(sellQty) || 0));
  const projectedRemaining = selected ? selected.medicine.quantity - qtyNum : 0;
  const willTriggerLowStock =
    selected && !selected.isExpired && qtyNum > 0 && projectedRemaining >= 0 && projectedRemaining <= selected.medicine.minStockLevel;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setSubmitting(true);
    try {
      await dispenseMedicineSale(ownerId, selected.medicine, qtyNum, note, orders);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete sale.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4">
        <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Dispense / Record Sale</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Deducts available stock and enforces expiry safety locks.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Select Medicine Batch *
                </label>
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  Scan Barcode
                </button>
              </div>
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setError(null);
                }}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                {classifiedList.length === 0 && <option value="">No medicine batches in inventory</option>}
                {classifiedList.map((item) => (
                  <option key={item.medicine.id} value={item.medicine.id}>
                    {item.medicine.name} · Batch {item.medicine.batchNumber} · {item.medicine.quantity} units
                    {item.isExpired ? ' [EXPIRED - BLOCKED]' : ''}
                  </option>
                ))}
              </select>
            </div>

            {selected && selected.isExpired && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800">
                  <p className="font-semibold">Sale Blocked: Expired Medicine</p>
                  <p className="mt-0.5">
                    Batch <span className="font-mono">{selected.medicine.batchNumber}</span> expired on{' '}
                    <span className="font-mono">{selected.medicine.expiryDate}</span>. Expired stock
                    cannot be dispensed and must be quarantined or disposed.
                  </p>
                </div>
              </div>
            )}

            {selected && !selected.isExpired && (
              <>
                <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div>
                    <span className="text-slate-500 block">Available</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums text-sm">
                      {selected.medicine.quantity} units
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Unit Price</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums text-sm">
                      {formatCurrency(selected.medicine.unitPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Expiry Date</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums text-sm">
                      {selected.medicine.expiryDate}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Quantity to Dispense *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={Math.max(1, selected.medicine.quantity)}
                      value={sellQty}
                      onChange={(e) => setSellQty(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Sale Total
                    </label>
                    <div className="px-3 py-2 text-sm font-mono font-semibold tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900">
                      {formatCurrency(qtyNum * selected.medicine.unitPrice)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Prescription / Counter Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Rx #4491 counter dispense"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                {willTriggerLowStock && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p>
                      After this sale, <span className="font-semibold">{projectedRemaining}</span>{' '}
                      units will remain (at or below min stock level of{' '}
                      <span className="font-mono">{selected.medicine.minStockLevel}</span>). A
                      reorder approval request will be queued for your review.
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  submitting ||
                  !selected ||
                  selected.isExpired ||
                  selected.medicine.quantity <= 0 ||
                  qtyNum <= 0 ||
                  qtyNum > selected.medicine.quantity
                }
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <ShoppingBag className="w-4 h-4" />
                {submitting ? 'Recording Sale...' : 'Confirm & Deduct Stock'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleBarcodeMatch}
        title="Scan Medicine Barcode to Dispense"
      />
    </>
  );
}
