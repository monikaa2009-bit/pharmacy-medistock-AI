import type {
  AlertSeverity,
  ClassifiedMedicine,
  Medicine,
  MedicineHealthStatus,
  StockMovement,
  SupplierOrder,
} from '../types/pharmacy';

export function getLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysUntilExpiry(expiryDateStr: string, referenceDate: Date = new Date()): number {
  const todayStr = getLocalDateStr(referenceDate);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [ey, em, ed] = expiryDateStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const expiryUtc = Date.UTC(ey, em - 1, ed);
  return Math.round((expiryUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export function classifyMedicine(
  medicine: Medicine,
  expiryAlertDays: number = 30
): ClassifiedMedicine {
  const daysUntilExpiry = getDaysUntilExpiry(medicine.expiryDate);
  const isExpired = daysUntilExpiry <= 0 || medicine.disposed;
  const isExpiringSoon = !isExpired && daysUntilExpiry <= expiryAlertDays && medicine.quantity > 0;
  const isLowStock = !isExpired && medicine.quantity <= medicine.minStockLevel;
  const isAvailable = !isExpired && medicine.quantity > 0;

  let primaryStatus: MedicineHealthStatus = 'sufficient';
  let severity: AlertSeverity = 'green';
  let statusLabel = 'Sufficient Stock';

  if (isExpired) {
    primaryStatus = 'expired';
    severity = 'red';
    statusLabel = medicine.disposed ? 'Disposed (Expired)' : 'Expired';
  } else if (isExpiringSoon) {
    primaryStatus = 'expiring_soon';
    severity = 'orange';
    statusLabel = `Expiring in ${daysUntilExpiry}d`;
  } else if (isLowStock) {
    primaryStatus = 'low_stock';
    severity = 'yellow';
    statusLabel = 'Low Stock';
  }

  return {
    medicine,
    daysUntilExpiry,
    isExpired,
    isExpiringSoon,
    isLowStock,
    isAvailable,
    primaryStatus,
    severity,
    statusLabel,
  };
}

export interface DashboardMetrics {
  totalMedicines: number;
  availableStockUnits: number;
  availableBatchesCount: number;
  lowStockCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  expiredUnits: number;
  pendingOrdersCount: number;
  awaitingApprovalCount: number;
  completedOrdersCount: number;
  inventoryValue: number;
}

export function computeDashboardMetrics(
  medicines: Medicine[],
  orders: SupplierOrder[],
  expiryAlertDays: number
): DashboardMetrics {
  const classified = medicines.map((m) => classifyMedicine(m, expiryAlertDays));

  let availableStockUnits = 0;
  let availableBatchesCount = 0;
  let lowStockCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let expiredUnits = 0;
  let inventoryValue = 0;

  for (const item of classified) {
    if (item.isExpired) {
      expiredCount += 1;
      expiredUnits += item.medicine.quantity;
    } else {
      availableStockUnits += item.medicine.quantity;
      if (item.medicine.quantity > 0) {
        availableBatchesCount += 1;
      }
      inventoryValue += item.medicine.quantity * item.medicine.unitPrice;
      if (item.isLowStock) {
        lowStockCount += 1;
      }
      if (item.isExpiringSoon) {
        expiringSoonCount += 1;
      }
    }
  }

  const awaitingApprovalCount = orders.filter((o) => o.status === 'pending_approval').length;
  const pendingOrdersCount = orders.filter(
    (o) => o.status === 'pending_approval' || o.status === 'ordered' || o.status === 'in_transit'
  ).length;
  const completedOrdersCount = orders.filter((o) => o.status === 'completed').length;

  return {
    totalMedicines: medicines.length,
    availableStockUnits,
    availableBatchesCount,
    lowStockCount,
    expiringSoonCount,
    expiredCount,
    expiredUnits,
    pendingOrdersCount,
    awaitingApprovalCount,
    completedOrdersCount,
    inventoryValue,
  };
}

export type ReportPeriod = 'daily' | 'weekly' | 'monthly';

export interface ReportBucket {
  label: string;
  salesUnits: number;
  restockUnits: number;
  disposedUnits: number;
  salesRevenue: number;
}

export interface StockReportSummary {
  period: ReportPeriod;
  periodLabel: string;
  totalSalesUnits: number;
  totalSalesRevenue: number;
  totalRestockUnits: number;
  totalDisposedUnits: number;
  movementsInPeriod: StockMovement[];
  buckets: ReportBucket[];
  expiryBreakdown: {
    expiredBatches: number;
    expiredUnits: number;
    expiredValue: number;
    within15DaysBatches: number;
    within15DaysUnits: number;
    within30DaysBatches: number;
    within30DaysUnits: number;
    healthyBatches: number;
    healthyUnits: number;
  };
  orderSummary: {
    pendingApproval: number;
    orderedOrTransit: number;
    completed: number;
    rejected: number;
    totalSpendCompleted: number;
  };
}

export function buildStockReport(
  medicines: Medicine[],
  movements: StockMovement[],
  orders: SupplierOrder[],
  period: ReportPeriod,
  expiryAlertDays: number
): StockReportSummary {
  const now = new Date();
  const daysBack = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const cutoffMs = now.getTime() - daysBack * 24 * 60 * 60 * 1000;

  const movementsInPeriod = movements.filter((mv) => {
    const ms = mv.createdAt ? mv.createdAt.toMillis() : now.getTime();
    return ms >= cutoffMs;
  });

  let totalSalesUnits = 0;
  let totalSalesRevenue = 0;
  let totalRestockUnits = 0;
  let totalDisposedUnits = 0;

  for (const mv of movementsInPeriod) {
    if (mv.type === 'sale') {
      totalSalesUnits += Math.abs(mv.quantityDelta);
      totalSalesRevenue += mv.totalAmount;
    } else if (mv.type === 'restock' || mv.type === 'initial') {
      totalRestockUnits += Math.max(0, mv.quantityDelta);
    } else if (mv.type === 'expired_disposal') {
      totalDisposedUnits += Math.abs(mv.quantityDelta);
    }
  }

  // Build time buckets for visualization
  const bucketCount = period === 'daily' ? 6 : period === 'weekly' ? 7 : 6;
  const buckets: ReportBucket[] = [];

  if (period === 'daily') {
    for (let i = bucketCount - 1; i >= 0; i--) {
      const endMs = now.getTime() - i * 4 * 60 * 60 * 1000;
      const startMs = endMs - 4 * 60 * 60 * 1000;
      const endDate = new Date(endMs);
      const label = `${String(endDate.getHours()).padStart(2, '0')}:00`;
      buckets.push(aggregateBucket(label, movementsInPeriod, startMs, endMs));
    }
  } else if (period === 'weekly') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const startMs = d.getTime();
      const endMs = startMs + 24 * 60 * 60 * 1000;
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      buckets.push(aggregateBucket(label, movementsInPeriod, startMs, endMs));
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const endMs = now.getTime() - i * 5 * 24 * 60 * 60 * 1000;
      const startMs = endMs - 5 * 24 * 60 * 60 * 1000;
      const d = new Date(endMs);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      buckets.push(aggregateBucket(label, movementsInPeriod, startMs, endMs));
    }
  }

  const classified = medicines.map((m) => classifyMedicine(m, expiryAlertDays));
  const expiryBreakdown = {
    expiredBatches: 0,
    expiredUnits: 0,
    expiredValue: 0,
    within15DaysBatches: 0,
    within15DaysUnits: 0,
    within30DaysBatches: 0,
    within30DaysUnits: 0,
    healthyBatches: 0,
    healthyUnits: 0,
  };

  for (const item of classified) {
    const qty = item.medicine.quantity;
    const val = qty * item.medicine.unitPrice;
    if (item.isExpired) {
      expiryBreakdown.expiredBatches += 1;
      expiryBreakdown.expiredUnits += qty;
      expiryBreakdown.expiredValue += val;
    } else if (item.daysUntilExpiry <= 15) {
      expiryBreakdown.within15DaysBatches += 1;
      expiryBreakdown.within15DaysUnits += qty;
    } else if (item.daysUntilExpiry <= Math.max(30, expiryAlertDays)) {
      expiryBreakdown.within30DaysBatches += 1;
      expiryBreakdown.within30DaysUnits += qty;
    } else {
      expiryBreakdown.healthyBatches += 1;
      expiryBreakdown.healthyUnits += qty;
    }
  }

  const orderSummary = {
    pendingApproval: orders.filter((o) => o.status === 'pending_approval').length,
    orderedOrTransit: orders.filter((o) => o.status === 'ordered' || o.status === 'in_transit').length,
    completed: orders.filter((o) => o.status === 'completed').length,
    rejected: orders.filter((o) => o.status === 'rejected').length,
    totalSpendCompleted: orders
      .filter((o) => o.status === 'completed')
      .reduce((sum, o) => sum + o.totalCost, 0),
  };

  const periodLabel =
    period === 'daily'
      ? 'Last 24 Hours (Daily)'
      : period === 'weekly'
        ? 'Last 7 Days (Weekly)'
        : 'Last 30 Days (Monthly)';

  return {
    period,
    periodLabel,
    totalSalesUnits,
    totalSalesRevenue,
    totalRestockUnits,
    totalDisposedUnits,
    movementsInPeriod,
    buckets,
    expiryBreakdown,
    orderSummary,
  };
}

function aggregateBucket(
  label: string,
  movements: StockMovement[],
  startMs: number,
  endMs: number
): ReportBucket {
  let salesUnits = 0;
  let restockUnits = 0;
  let disposedUnits = 0;
  let salesRevenue = 0;

  for (const mv of movements) {
    const ms = mv.createdAt ? mv.createdAt.toMillis() : Date.now();
    if (ms >= startMs && ms < endMs) {
      if (mv.type === 'sale') {
        salesUnits += Math.abs(mv.quantityDelta);
        salesRevenue += mv.totalAmount;
      } else if (mv.type === 'restock' || mv.type === 'initial') {
        restockUnits += Math.max(0, mv.quantityDelta);
      } else if (mv.type === 'expired_disposal') {
        disposedUnits += Math.abs(mv.quantityDelta);
      }
    }
  }

  return { label, salesUnits, restockUnits, disposedUnits, salesRevenue };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function sanitizeIdentifierInput(raw: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
}

export function exportCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
