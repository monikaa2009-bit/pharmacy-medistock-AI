import React, { useEffect, useState } from 'react';
import { ScanBarcode, X } from 'lucide-react';
import type { Medicine } from '../types/pharmacy';
import {
  addMedicineBatch,
  updateMedicineMetadata,
  type MedicineInput,
} from '../services/pharmacyService';
import { getLocalDateStr, sanitizeIdentifierInput } from '../utils/inventoryLogic';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface AddEditMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  expiryAlertDays: number;
  existingMedicines: Medicine[];
  editingMedicine?: Medicine | null;
  initialBarcode?: string;
}

const CATEGORIES = [
  'Analgesic',
  'Antibiotic',
  'Antiviral',
  'Cardiovascular',
  'Diabetes Care',
  'Gastrointestinal',
  'Respiratory',
  'Dermatology',
  'Vitamins & Supplements',
  'General',
];

export function AddEditMedicineModal({
  isOpen,
  onClose,
  ownerId,
  expiryAlertDays,
  existingMedicines,
  editingMedicine,
  initialBarcode = '',
}: AddEditMedicineModalProps) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [category, setCategory] = useState('General');
  const [manufacturingDate, setManufacturingDate] = useState(getLocalDateStr());
  const [expiryDate, setExpiryDate] = useState('');
  const [quantity, setQuantity] = useState<string>('50');
  const [minStockLevel, setMinStockLevel] = useState<string>('10');
  const [unitPrice, setUnitPrice] = useState<string>('12.50');
  const [supplierName, setSupplierName] = useState('');
  const [supplierEmail, setSupplierEmail] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [matchedNotice, setMatchedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setMatchedNotice(null);

    if (editingMedicine) {
      setName(editingMedicine.name);
      setBarcode(editingMedicine.barcode);
      setBatchNumber(editingMedicine.batchNumber);
      setCategory(editingMedicine.category);
      setManufacturingDate(editingMedicine.manufacturingDate);
      setExpiryDate(editingMedicine.expiryDate);
      setQuantity(String(editingMedicine.quantity));
      setMinStockLevel(String(editingMedicine.minStockLevel));
      setUnitPrice(String(editingMedicine.unitPrice));
      setSupplierName(editingMedicine.supplierName);
      setSupplierEmail(editingMedicine.supplierEmail);
      setSupplierPhone(editingMedicine.supplierPhone);
    } else {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setName('');
      setBarcode(initialBarcode);
      setBatchNumber('');
      setCategory('General');
      setManufacturingDate(getLocalDateStr());
      setExpiryDate(getLocalDateStr(nextYear));
      setQuantity('50');
      setMinStockLevel('10');
      setUnitPrice('12.50');
      setSupplierName('');
      setSupplierEmail('');
      setSupplierPhone('');

      if (initialBarcode) {
        applyBarcodeLookup(initialBarcode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingMedicine, initialBarcode]);

  const applyBarcodeLookup = (code: string) => {
    const cleaned = sanitizeIdentifierInput(code);
    setBarcode(cleaned);
    if (!editingMedicine && cleaned.length >= 3) {
      const match = existingMedicines.find(
        (m) => m.barcode.toLowerCase() === cleaned.toLowerCase()
      );
      if (match) {
        setName(match.name);
        setCategory(match.category);
        setMinStockLevel(String(match.minStockLevel));
        setUnitPrice(String(match.unitPrice));
        setSupplierName(match.supplierName);
        setSupplierEmail(match.supplierEmail);
        setSupplierPhone(match.supplierPhone);
        setMatchedNotice(
          `Matched existing product "${match.name}". Enter the new batch number, dates, and quantity.`
        );
      } else {
        setMatchedNotice(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload: MedicineInput = {
      name,
      barcode: sanitizeIdentifierInput(barcode),
      batchNumber: sanitizeIdentifierInput(batchNumber),
      category,
      manufacturingDate,
      expiryDate,
      quantity: Number(quantity),
      minStockLevel: Number(minStockLevel),
      unitPrice: Number(unitPrice),
      supplierName,
      supplierEmail,
      supplierPhone,
    };

    try {
      if (editingMedicine) {
        await updateMedicineMetadata(ownerId, editingMedicine, payload, existingMedicines);
      } else {
        await addMedicineBatch(ownerId, payload, existingMedicines, expiryAlertDays);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save medicine record.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl my-8 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {editingMedicine ? 'Edit Medicine Batch Details' : 'Add Medicine Batch'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {editingMedicine
                  ? 'Update batch thresholds, dates, pricing, or supplier details.'
                  : 'Scan a barcode or enter batch specifications to add to live stock.'}
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

          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                {error}
              </div>
            )}

            {matchedNotice && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800">
                {matchedNotice}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Barcode Number *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={barcode}
                    onChange={(e) => applyBarcodeLookup(e.target.value)}
                    placeholder="e.g. 8901234567890"
                    className="flex-1 min-w-0 px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <ScanBarcode className="w-4 h-4" />
                    Scan
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Batch Number *
                </label>
                <input
                  type="text"
                  required
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="e.g. BCH-2026-04A"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Medicine Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Paracetamol 500mg Tablets"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Manufacturing Date *
                </label>
                <input
                  type="date"
                  required
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Expiry Date *
                </label>
                <input
                  type="date"
                  required
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Quantity (Units) *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={1000000}
                  disabled={Boolean(editingMedicine)}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {editingMedicine && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Updated via Dispense or Supplier Restock.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Min Stock Level *
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  max={100000}
                  value={minStockLevel}
                  onChange={(e) => setMinStockLevel(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Unit Price ($) *
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-4">
              <h3 className="text-xs font-semibold text-slate-700">
                Registered Supplier Details
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="e.g. Apex Pharma Dist."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Supplier Email
                  </label>
                  <input
                    type="email"
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    placeholder="orders@supplier.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Supplier Phone
                  </label>
                  <input
                    type="tel"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="+1 (555) 390-1200"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>
            </div>

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
                disabled={saving}
                className="px-5 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
              >
                {saving
                  ? 'Saving...'
                  : editingMedicine
                    ? 'Save Changes'
                    : 'Add Medicine to Inventory'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code) => applyBarcodeLookup(code)}
        title="Scan Medicine Box Barcode"
      />
    </>
  );
}
