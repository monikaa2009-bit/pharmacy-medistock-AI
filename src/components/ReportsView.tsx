import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import type { Medicine, StockMovement, SupplierOrder } from '../types/pharmacy';
import {
  buildStockReport,
  classifyMedicine,
  exportCsvFile,
  formatCurrency,
  type ReportPeriod,
} from '../utils/inventoryLogic';
import { StatusIndicator } from './StatusIndicator';

interface ReportsViewProps {
  medicines: Medicine[];
  movements: StockMovement[];
  orders: SupplierOrder[];
  expiryAlertDays: number;
}

export function ReportsView({
  medicines,
  movements,
  orders,
  expiryAlertDays,
}: ReportsViewProps) {
  const [period, setPeriod] = useState<ReportPeriod>('weekly');

  const report = useMemo(
    () => buildStockReport(medicines, movements, orders, period, expiryAlertDays),
    [medicines, movements, orders, period, expiryAlertDays]
  );

  const maxBucketUnits = Math.max(
    1,
    ...report.buckets.map((b) => Math.max(b.salesUnits, b.restockUnits, b.disposedUnits))
  );

  const handleExportMovements = () => {
    exportCsvFile(
      `medistock_${period}_stock_report.csv`,
      ['Date', 'Medicine', 'Barcode', 'Batch', 'Type', 'Qty Delta', 'Balance After', 'Total Amount', 'Note'],
      report.movementsInPeriod.map((mv) => [
        mv.createdAt ? mv.createdAt.toDate().toISOString() : '',
        mv.medicineName,
        mv.barcode,
        mv.batchNumber,
        mv.type,
        mv.quantityDelta,
        mv.quantityAfter,
        mv.totalAmount.toFixed(2),
        mv.note,
      ])
    );
  };

  const handleExportExpiry = () => {
    exportCsvFile(
      'medistock_expiry_report.csv',
      ['Medicine', 'Barcode', 'Batch', 'Expiry Date', 'Days Remaining', 'Quantity', 'Unit Price', 'Status'],
      medicines.map((m) => {
        const c = classifyMedicine(m, expiryAlertDays);
        return [
          m.name,
          m.barcode,
          m.batchNumber,
          m.expiryDate,
          c.daysUntilExpiry,
          m.quantity,
          m.unitPrice.toFixed(2),
          c.statusLabel,
        ];
      })
    );
  };

  const handleExportOrders = () => {
    exportCsvFile(
      'medistock_supplier_orders.csv',
      ['Reference', 'Medicine', 'Supplier', 'Order Qty', 'Total Cost', 'Status', 'Delivery Status'],
      orders.map((o) => [
        o.referenceNumber,
        o.medicineName,
        o.supplierName,
        o.orderQuantity,
        o.totalCost.toFixed(2),
        o.status,
        o.deliveryStatusText,
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Timeframe Controls & CSV Exports */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { key: 'daily', label: 'Daily Report' },
              { key: 'weekly', label: 'Weekly Report' },
              { key: 'monthly', label: 'Monthly Report' },
            ] as { key: ReportPeriod; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPeriod(tab.key)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                period === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportMovements}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Movements CSV
          </button>
          <button
            type="button"
            onClick={handleExportExpiry}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Expiry CSV
          </button>
          <button
            type="button"
            onClick={handleExportOrders}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Export Orders CSV
          </button>
        </div>
      </div>

      {/* Period Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Sales Units ({report.period})</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {report.totalSalesUnits}
          </p>
          <p className="text-xs text-slate-500 mt-1">{report.periodLabel}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Dispense Revenue</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-teal-700 mt-1">
            {formatCurrency(report.totalSalesRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Completed counter sales</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Stock Received / Intake</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
            +{report.totalRestockUnits}
          </p>
          <p className="text-xs text-slate-500 mt-1">New batches & deliveries</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Expired Stock Disposed</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-red-700 mt-1">
            {report.totalDisposedUnits}
          </p>
          <p className="text-xs text-slate-500 mt-1">Removed from sellable stock</p>
        </div>
      </div>

      {/* Chart + Expiry & Supplier Order Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Stock Movement Activity ({report.periodLabel})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Units sold vs units restocked across time intervals.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-teal-600 rounded-xs inline-block" />
                Sales
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-emerald-500 rounded-xs inline-block" />
                Intake / Restock
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-xs inline-block" />
                Disposed
              </span>
            </div>
          </div>

          <div className="pt-4">
            <div className="grid grid-cols-6 sm:grid-cols-7 gap-3 items-end h-48 border-b border-slate-200 pb-2">
              {report.buckets.map((bucket) => {
                const salesH = Math.round((bucket.salesUnits / maxBucketUnits) * 140);
                const restockH = Math.round((bucket.restockUnits / maxBucketUnits) * 140);
                const disposedH = Math.round((bucket.disposedUnits / maxBucketUnits) * 140);
                return (
                  <div key={bucket.label} className="flex flex-col items-center justify-end h-full gap-1.5">
                    <div className="flex items-end gap-1 h-[145px]">
                      <div
                        title={`Sales: ${bucket.salesUnits} units`}
                        style={{ height: `${Math.max(bucket.salesUnits > 0 ? 6 : 2, salesH)}px` }}
                        className="w-3 bg-teal-600 rounded-t-sm transition-all"
                      />
                      <div
                        title={`Restock: ${bucket.restockUnits} units`}
                        style={{ height: `${Math.max(bucket.restockUnits > 0 ? 6 : 2, restockH)}px` }}
                        className="w-3 bg-emerald-500 rounded-t-sm transition-all"
                      />
                      <div
                        title={`Disposed: ${bucket.disposedUnits} units`}
                        style={{ height: `${Math.max(bucket.disposedUnits > 0 ? 6 : 2, disposedH)}px` }}
                        className="w-3 bg-red-500 rounded-t-sm transition-all"
                      />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                      {bucket.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 space-y-6">
          {/* Expiry Report */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Expiry Status Report</h2>
            <div className="divide-y divide-slate-100 text-sm">
              <div className="py-2.5 flex items-center justify-between">
                <StatusIndicator severity="red" label="Expired (Quarantined)" compact />
                <span className="font-mono tabular-nums text-xs text-slate-900">
                  {report.expiryBreakdown.expiredBatches} batches · {report.expiryBreakdown.expiredUnits} units ({formatCurrency(report.expiryBreakdown.expiredValue)})
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <StatusIndicator severity="orange" label="Critical (<= 15 days)" compact />
                <span className="font-mono tabular-nums text-xs text-slate-900">
                  {report.expiryBreakdown.within15DaysBatches} batches · {report.expiryBreakdown.within15DaysUnits} units
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <StatusIndicator severity="yellow" label={`Warning (16–${Math.max(30, expiryAlertDays)} days)`} compact />
                <span className="font-mono tabular-nums text-xs text-slate-900">
                  {report.expiryBreakdown.within30DaysBatches} batches · {report.expiryBreakdown.within30DaysUnits} units
                </span>
              </div>
              <div className="py-2.5 flex items-center justify-between">
                <StatusIndicator severity="green" label="Healthy Shelf Life" compact />
                <span className="font-mono tabular-nums text-xs text-slate-900">
                  {report.expiryBreakdown.healthyBatches} batches · {report.expiryBreakdown.healthyUnits} units
                </span>
              </div>
            </div>
          </div>

          {/* Supplier Order Summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Supplier Order Summary</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Pending Approval</span>
                <span className="text-lg font-bold font-mono tabular-nums text-amber-800">
                  {report.orderSummary.pendingApproval}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Ordered / In Transit</span>
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {report.orderSummary.orderedOrTransit}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Completed Deliveries</span>
                <span className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                  {report.orderSummary.completed}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="text-slate-500 block">Completed Spend</span>
                <span className="text-lg font-bold font-mono tabular-nums text-slate-900">
                  {formatCurrency(report.orderSummary.totalSpendCompleted)}
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Detailed Stock Movement Ledger */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900">
            Stock Movements Ledger ({report.periodLabel})
          </h2>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            {report.movementsInPeriod.length} transactions
          </span>
        </div>

        {report.movementsInPeriod.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No stock movements recorded in this timeframe.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Medicine</th>
                  <th className="py-3 px-4">Batch</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4 text-right">Change</th>
                  <th className="py-3 px-4 text-right">Balance</th>
                  <th className="py-3 px-4 text-right">Value</th>
                  <th className="py-3 px-4">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {report.movementsInPeriod.map((mv) => (
                  <tr key={mv.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                      {mv.createdAt ? mv.createdAt.toDate().toLocaleString() : '—'}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-slate-900">{mv.medicineName}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">{mv.batchNumber}</td>
                    <td className="py-2.5 px-4 capitalize text-slate-700">
                      {mv.type.replace('_', ' ')}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                        mv.quantityDelta > 0
                          ? 'text-emerald-700'
                          : mv.type === 'expired_disposal'
                            ? 'text-red-700'
                            : 'text-slate-900'
                      }`}
                    >
                      {mv.quantityDelta > 0 ? `+${mv.quantityDelta}` : mv.quantityDelta}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700">
                      {mv.quantityAfter}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                      {formatCurrency(mv.totalAmount)}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-xs truncate">{mv.note}</td>
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
