import { useState } from 'react';
import { Check, CheckCircle2, PackageCheck, Truck, X } from 'lucide-react';
import type { AlertNotification, SupplierOrder } from '../types/pharmacy';
import {
  advanceOrderDelivery,
  approveSupplierOrder,
  rejectSupplierOrder,
} from '../services/pharmacyService';
import { formatCurrency } from '../utils/inventoryLogic';
import { StatusIndicator } from './StatusIndicator';

interface OrdersViewProps {
  ownerId: string;
  orders: SupplierOrder[];
  notifications: AlertNotification[];
}

export function OrdersView({ ownerId, orders, notifications }: OrdersViewProps) {
  const [qtyEdits, setQtyEdits] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const pendingApproval = orders.filter((o) => o.status === 'pending_approval');
  const activeDeliveries = orders.filter(
    (o) => o.status === 'ordered' || o.status === 'in_transit'
  );
  const historyOrders = orders.filter(
    (o) => o.status === 'completed' || o.status === 'rejected'
  );

  const handleApprove = async (order: SupplierOrder) => {
    setError(null);
    setConfirmation(null);
    setBusyId(order.id);
    try {
      const qty = qtyEdits[order.id] ?? order.orderQuantity;
      await approveSupplierOrder(ownerId, order, qty, notifications);
      setConfirmation(
        `Order ${order.referenceNumber} confirmed: ${qty} units of ${order.medicineName} placed with ${order.supplierName}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve order.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (order: SupplierOrder) => {
    setError(null);
    setConfirmation(null);
    setBusyId(order.id);
    try {
      await rejectSupplierOrder(ownerId, order, notifications);
      setConfirmation(`Order ${order.referenceNumber} for ${order.medicineName} was rejected and not placed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject order.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvance = async (
    order: SupplierOrder,
    nextStatus: 'in_transit' | 'completed'
  ) => {
    setError(null);
    setConfirmation(null);
    setBusyId(order.id);
    try {
      await advanceOrderDelivery(ownerId, order, nextStatus);
      setConfirmation(
        nextStatus === 'in_transit'
          ? `Order ${order.referenceNumber} marked as In Transit.`
          : `Order ${order.referenceNumber} delivered. +${order.orderQuantity} units added to ${order.medicineName} stock.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update delivery status.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
          {error}
        </div>
      )}
      {confirmation && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-800 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{confirmation}</span>
        </div>
      )}

      {/* Pending Owner Approval */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Pending Owner Approval
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Low-stock alerts wait here until you explicitly approve or reject the supplier order.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            {pendingApproval.length} pending
          </span>
        </div>

        {pendingApproval.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No supplier reorders awaiting approval right now.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {pendingApproval.map((order) => {
              const qtyVal = qtyEdits[order.id] ?? order.orderQuantity;
              const busy = busyId === order.id;
              return (
                <div
                  key={order.id}
                  className="p-5 bg-amber-50/40 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <StatusIndicator
                      severity="yellow"
                      label="Yellow · Awaiting Approval"
                      compact
                    />
                    <p className="text-sm font-semibold text-slate-900">
                      {order.medicineName} stock is running low. Only{' '}
                      <span className="font-mono tabular-nums">{order.currentStockAtTrigger}</span>{' '}
                      units are remaining. Do you want to reorder?
                    </p>
                    <p className="text-xs text-slate-600">
                      Ref <span className="font-mono">{order.referenceNumber}</span> · Supplier:{' '}
                      <span className="font-medium text-slate-900">{order.supplierName}</span>
                      {order.supplierEmail ? ` (${order.supplierEmail})` : ''}
                      {' · '}Est. Total:{' '}
                      <span className="font-mono font-semibold tabular-nums">
                        {formatCurrency(qtyVal * order.unitCost)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-600">Qty:</label>
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
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleReject(order)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject Order
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleApprove(order)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {busy ? 'Placing...' : 'Approve Order'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Approved Orders & Delivery Tracking */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Active Supplier Orders & Delivery Status
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track confirmed purchase orders through delivery and automatic inventory restock.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            {activeDeliveries.length} active
          </span>
        </div>

        {activeDeliveries.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No active orders currently in transit or awaiting delivery.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Order Qty</th>
                  <th className="py-3 px-4 text-right">Total Cost</th>
                  <th className="py-3 px-4">Delivery Status</th>
                  <th className="py-3 px-4 text-right">Update Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {activeDeliveries.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                      {order.referenceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium text-slate-900">{order.medicineName}</p>
                      <p className="text-xs font-mono text-slate-500">{order.barcode}</p>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-700">
                      <p className="font-medium text-slate-900">{order.supplierName}</p>
                      <p className="text-slate-500">{order.supplierPhone || order.supplierEmail}</p>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                      {order.orderQuantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(order.totalCost)}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <StatusIndicator
                        severity="orange"
                        label={order.status === 'in_transit' ? 'In Transit' : 'Order Placed'}
                        compact
                      />
                      <p className="text-slate-500 mt-0.5">{order.deliveryStatusText}</p>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {order.status === 'ordered' && (
                          <button
                            type="button"
                            disabled={busyId === order.id}
                            onClick={() => void handleAdvance(order, 'in_transit')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Mark In Transit
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === order.id}
                          onClick={() => void handleAdvance(order, 'completed')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          Mark Delivered & Restock
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Completed & Rejected Order History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Completed & Rejected Orders
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Immutable historical record of supplier deliveries and declined reorders.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600">
            {historyOrders.length} orders
          </span>
        </div>

        {historyOrders.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No completed or rejected orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Order Ref</th>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4 text-right">Qty</th>
                  <th className="py-3 px-4 text-right">Total Cost</th>
                  <th className="py-3 px-4">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {historyOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">
                      {order.referenceNumber}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{order.medicineName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{order.supplierName}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {order.orderQuantity}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {formatCurrency(order.totalCost)}
                    </td>
                    <td className="py-3 px-4">
                      {order.status === 'completed' ? (
                        <StatusIndicator severity="green" label="Completed · Delivered" compact />
                      ) : (
                        <StatusIndicator severity="red" label="Rejected · Not Placed" compact />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
