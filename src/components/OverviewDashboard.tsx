import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  PackagePlus,
  ScanBarcode,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AlertNotification,
  Medicine,
  NavTab,
  StockMovement,
  SupplierOrder,
} from '../types/pharmacy';
import {
  approveSupplierOrder,
  disposeExpiredBatch,
  rejectSupplierOrder,
} from '../services/pharmacyService';
import {
  classifyMedicine,
  computeDashboardMetrics,
  formatCurrency,
} from '../utils/inventoryLogic';
import { StatusIndicator } from './StatusIndicator';

interface OverviewDashboardProps {
  ownerId: string;
  medicines: Medicine[];
  orders: SupplierOrder[];
  movements: StockMovement[];
  notifications: AlertNotification[];
  expiryAlertDays: number;
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onOpenAddMedicine: () => void;
  onOpenScanIntake: () => void;
  onOpenDispense: (medicineId?: string) => void;
}

export function OverviewDashboard({
  ownerId,
  medicines,
  orders,
  movements,
  notifications,
  expiryAlertDays,
  loading,
  onNavigate,
  onOpenAddMedicine,
  onOpenScanIntake,
  onOpenDispense,
}: OverviewDashboardProps) {
  const [qtyEdits, setQtyEdits] = useState<Record<string, number>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [busyMedId, setBusyMedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const metrics = computeDashboardMetrics(medicines, orders, expiryAlertDays);
  const classified = medicines.map((m) => classifyMedicine(m, expiryAlertDays));

  const pendingApprovalOrders = orders.filter((o) => o.status === 'pending_approval');
  const expiringSoonItems = classified
    .filter((c) => c.isExpiringSoon)
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  const expiredItems = classified.filter((c) => c.isExpired && !c.medicine.disposed);

  const handleApprove = async (order: SupplierOrder) => {
    setActionError(null);
    setBusyOrderId(order.id);
    try {
      const qty = qtyEdits[order.id] ?? order.orderQuantity;
      await approveSupplierOrder(ownerId, order, qty, notifications);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to approve order.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleReject = async (order: SupplierOrder) => {
    setActionError(null);
    setBusyOrderId(order.id);
    try {
      await rejectSupplierOrder(ownerId, order, notifications);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to reject order.');
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleDispose = async (med: Medicine) => {
    setActionError(null);
    setBusyMedId(med.id);
    try {
      await disposeExpiredBatch(ownerId, med, notifications);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to dispose expired batch.');
    } finally {
      setBusyMedId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
          {actionError}
        </div>
      )}

      {/* 7-Metric Real-Time KPI Strip */}
      <section aria-label="Inventory summary metrics">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">Total Medicines</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {metrics.totalMedicines}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Registered batches</p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-emerald-700">Available Stock</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {metrics.availableStockUnits}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
              {formatCurrency(metrics.inventoryValue)} sellable
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="text-left bg-white border border-slate-200 hover:border-amber-300 rounded-xl p-4 transition-colors"
          >
            <p className="text-xs font-medium text-amber-800">Low-Stock</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-800 mt-1">
              {metrics.lowStockCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Yellow · Reorder check</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('alerts')}
            className="text-left bg-white border border-slate-200 hover:border-orange-300 rounded-xl p-4 transition-colors"
          >
            <p className="text-xs font-medium text-orange-700">Nearing Expiry</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-orange-700 mt-1">
              {metrics.expiringSoonCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Orange · Within {expiryAlertDays}d</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="text-left bg-white border border-slate-200 hover:border-red-300 rounded-xl p-4 transition-colors"
          >
            <p className="text-xs font-medium text-red-700">Expired Batches</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
              {metrics.expiredCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Red · Blocked from sale</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-left bg-white border border-slate-200 hover:border-teal-300 rounded-xl p-4 transition-colors"
          >
            <p className="text-xs font-medium text-slate-600">Pending Orders</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {metrics.pendingOrdersCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 tabular-nums">
              {metrics.awaitingApprovalCount} awaiting approval
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-left bg-white border border-slate-200 hover:border-emerald-300 rounded-xl p-4 transition-colors"
          >
            <p className="text-xs font-medium text-emerald-700">Completed Orders</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {metrics.completedOrdersCount}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Delivered & stocked</p>
          </button>
        </div>
      </section>

      {medicines.length === 0 ? (
        <section className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-900">
            Your pharmacy inventory is ready
          </h2>
          <p className="text-sm text-slate-600 mt-2 max-w-lg mx-auto">
            Add your first medicine batch by scanning its barcode or entering batch details.
            MediStock AI will monitor stock levels, track expiry dates, and prepare approval-gated
            supplier reorders automatically.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenScanIntake}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors"
            >
              <ScanBarcode className="w-4 h-4" />
              Scan Medicine Barcode
            </button>
            <button
              type="button"
              onClick={onOpenAddMedicine}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <PackagePlus className="w-4 h-4" />
              Add Medicine Manually
            </button>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Smart Reorder Approvals + Expiry Warnings */}
          <div className="lg:col-span-7 space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Reorder Approvals Required
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Orders are never placed with suppliers without your explicit approval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('orders')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
                >
                  All Orders
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {pendingApprovalOrders.length === 0 ? (
                <div className="p-6 text-sm text-slate-600 flex items-center justify-between gap-4">
                  <StatusIndicator
                    severity="green"
                    label="All low-stock reorder requests reviewed"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenDispense()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Record Sale
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {pendingApprovalOrders.map((order) => {
                    const qtyVal = qtyEdits[order.id] ?? order.orderQuantity;
                    const busy = busyOrderId === order.id;
                    return (
                      <div key={order.id} className="p-5 space-y-3 bg-amber-50/40">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1">
                            <StatusIndicator
                              severity="yellow"
                              label="Low Stock · Owner Approval Needed"
                              compact
                            />
                            <p className="text-sm font-semibold text-slate-900">
                              {order.medicineName} stock is running low. Only{' '}
                              <span className="font-mono tabular-nums">
                                {order.currentStockAtTrigger}
                              </span>{' '}
                              units are remaining. Do you want to reorder?
                            </p>
                            <p className="text-xs text-slate-600">
                              Supplier: <span className="font-medium">{order.supplierName}</span>
                              {' · '}Ref <span className="font-mono">{order.referenceNumber}</span>
                              {' · '}Est. Cost{' '}
                              <span className="font-mono tabular-nums font-medium">
                                {formatCurrency(qtyVal * order.unitCost)}
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-slate-600">
                              Order Qty:
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={100000}
                              value={qtyVal}
                              onChange={(e) =>
                                setQtyEdits((prev) => ({
                                  ...prev,
                                  [order.id]: Math.max(1, Math.round(Number(e.target.value) || 1)),
                                }))
                              }
                              className="w-24 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-300 rounded-lg"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleReject(order)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject Order
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleApprove(order)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {busy ? 'Placing...' : 'Approve Order'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Expiry & Quarantine Monitor */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Expiry & Quarantine Monitor
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Expired batches are separated from sellable stock and locked at dispense.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('alerts')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
                >
                  View Alerts
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {expiredItems.length === 0 && expiringSoonItems.length === 0 ? (
                <div className="p-6">
                  <StatusIndicator
                    severity="green"
                    label={`No expired batches or medicines expiring within ${expiryAlertDays} days`}
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {expiredItems.map(({ medicine }) => (
                    <div
                      key={medicine.id}
                      className="p-4 bg-red-50/50 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs font-semibold text-red-700">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>Red · Expired (Blocked from Sale)</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          {medicine.name} · Batch <span className="font-mono">{medicine.batchNumber}</span>
                        </p>
                        <p className="text-xs text-slate-600">
                          <span className="font-mono tabular-nums">{medicine.quantity}</span> units
                          expired on <span className="font-mono">{medicine.expiryDate}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyMedId === medicine.id}
                        onClick={() => void handleDispose(medicine)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {busyMedId === medicine.id ? 'Disposing...' : 'Dispose Stock'}
                      </button>
                    </div>
                  ))}

                  {expiringSoonItems.map(({ medicine, daysUntilExpiry }) => (
                    <div
                      key={medicine.id}
                      className="p-4 bg-orange-50/40 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 max-w-lg">
                        <div className="flex items-center gap-2 text-xs font-semibold text-orange-700">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>Orange · Expiry Approaching</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900">
                          Warning! {medicine.quantity} units of {medicine.name} will expire in{' '}
                          {daysUntilExpiry} days. Please sell or manage the stock before the expiry
                          date.
                        </p>
                        <p className="text-xs text-slate-600">
                          Batch <span className="font-mono">{medicine.batchNumber}</span> · Expires{' '}
                          <span className="font-mono">{medicine.expiryDate}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenDispense(medicine.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                      >
                        Dispense Priority
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Recent Stock Movements & Color-Coded Legend */}
          <div className="lg:col-span-5 space-y-6">
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Recent Stock Movements
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Live sales, intake, supplier restocks, and disposals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800 whitespace-nowrap shrink-0"
                >
                  Full Reports
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {movements.length === 0 ? (
                <div className="p-6 text-sm text-slate-500">
                  No stock movements recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {movements.slice(0, 7).map((mv) => {
                    const isPositive = mv.quantityDelta > 0;
                    const typeLabel =
                      mv.type === 'sale'
                        ? 'Sale'
                        : mv.type === 'restock'
                          ? 'Restock'
                          : mv.type === 'initial'
                            ? 'Intake'
                            : mv.type === 'expired_disposal'
                              ? 'Disposed'
                              : 'Adjustment';
                    return (
                      <div key={mv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {mv.medicineName}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {typeLabel} · Batch <span className="font-mono">{mv.batchNumber}</span>
                            {mv.createdAt
                              ? ` · ${mv.createdAt.toDate().toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p
                            className={`text-sm font-mono font-semibold tabular-nums ${
                              mv.type === 'expired_disposal'
                                ? 'text-red-700'
                                : isPositive
                                  ? 'text-emerald-700'
                                  : 'text-slate-900'
                            }`}
                          >
                            {isPositive ? `+${mv.quantityDelta}` : mv.quantityDelta} units
                          </p>
                          <p className="text-[11px] font-mono tabular-nums text-slate-500">
                            Bal: {mv.quantityAfter}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Color-Coded Status Reference */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Notification & Status Legend
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <StatusIndicator severity="green" label="Green · Sufficient Stock" compact />
                  <p className="text-slate-600 mt-1">Above min stock and healthy expiry window.</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <StatusIndicator severity="yellow" label="Yellow · Low Stock" compact />
                  <p className="text-slate-600 mt-1">At or below threshold; reorder queued.</p>
                </div>
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <StatusIndicator severity="orange" label="Orange · Expiry Approaching" compact />
                  <p className="text-slate-600 mt-1">Within {expiryAlertDays} days of expiry date.</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <StatusIndicator severity="red" label="Red · Expired Medicine" compact />
                  <p className="text-slate-600 mt-1">Quarantined and blocked from sales.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Quick low-stock reminder strip if any non-expired medicine is low stock without pending order */}
      {classified.some(
        (c) =>
          c.isLowStock &&
          !orders.some(
            (o) =>
              o.medicineId === c.medicine.id &&
              (o.status === 'pending_approval' || o.status === 'ordered' || o.status === 'in_transit')
          )
      ) && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Some low-stock batches have previously rejected orders. Review them in Inventory to
              request a fresh reorder.
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="text-xs font-semibold text-amber-900 underline whitespace-nowrap shrink-0"
          >
            Open Inventory
          </button>
        </div>
      )}
    </div>
  );
}
