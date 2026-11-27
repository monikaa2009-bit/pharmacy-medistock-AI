import { useMemo, useState } from 'react';
import { Check, CheckCheck, Trash2, X } from 'lucide-react';
import type { AlertNotification, AlertSeverity, Medicine, SupplierOrder } from '../types/pharmacy';
import {
  approveSupplierOrder,
  disposeExpiredBatch,
  markAllNotificationsRead,
  markNotificationRead,
  rejectSupplierOrder,
} from '../services/pharmacyService';
import { getSeveritySurfaceClasses, StatusIndicator } from './StatusIndicator';

interface AlertsViewProps {
  ownerId: string;
  notifications: AlertNotification[];
  orders: SupplierOrder[];
  medicines: Medicine[];
}

export function AlertsView({
  ownerId,
  notifications,
  orders,
  medicines,
}: AlertsViewProps) {
  const [filterSeverity, setFilterSeverity] = useState<'all' | AlertSeverity>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filterSeverity === 'all') return notifications;
    return notifications.filter((n) => n.severity === filterSeverity);
  }, [notifications, filterSeverity]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = async () => {
    setError(null);
    try {
      await markAllNotificationsRead(ownerId, notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark alerts as read.');
    }
  };

  const handleApproveFromAlert = async (notif: AlertNotification, order: SupplierOrder) => {
    setError(null);
    setBusyId(notif.id);
    try {
      await approveSupplierOrder(ownerId, order, order.orderQuantity, notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve order.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectFromAlert = async (notif: AlertNotification, order: SupplierOrder) => {
    setError(null);
    setBusyId(notif.id);
    try {
      await rejectSupplierOrder(ownerId, order, notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject order.');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisposeFromAlert = async (notif: AlertNotification, med: Medicine) => {
    setError(null);
    setBusyId(notif.id);
    try {
      await disposeExpiredBatch(ownerId, med, notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to dispose expired batch.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {(
            [
              { key: 'all', label: `All (${notifications.length})` },
              { key: 'yellow', label: 'Yellow · Low Stock' },
              { key: 'orange', label: 'Orange · Expiry Approaching' },
              { key: 'red', label: 'Red · Expired' },
              { key: 'green', label: 'Green · Order Updates' },
            ] as { key: 'all' | AlertSeverity; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterSeverity(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterSeverity === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void handleMarkAllRead()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
          >
            <CheckCheck className="w-4 h-4" />
            Mark All Read ({unreadCount})
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
          {error}
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No notifications match the selected alert category.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filtered.map((notif) => {
              const linkedOrder = notif.orderId
                ? orders.find((o) => o.id === notif.orderId)
                : undefined;
              const linkedMed = medicines.find((m) => m.id === notif.medicineId);
              const severityLabel =
                notif.severity === 'yellow'
                  ? 'Yellow · Low Stock'
                  : notif.severity === 'orange'
                    ? 'Orange · Expiry Approaching'
                    : notif.severity === 'red'
                      ? 'Red · Expired Medicine'
                      : 'Green · Confirmed / Nominal';

              return (
                <div
                  key={notif.id}
                  className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    !notif.read ? getSeveritySurfaceClasses(notif.severity) : 'bg-white'
                  }`}
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <StatusIndicator severity={notif.severity} label={severityLabel} compact />
                      <span className="text-slate-400" aria-hidden="true">·</span>
                      <span className="text-slate-500 font-mono">
                        {notif.createdAt ? notif.createdAt.toDate().toLocaleString() : 'Just now'}
                      </span>
                      {notif.resolved && (
                        <>
                          <span className="text-slate-400" aria-hidden="true">·</span>
                          <span className="text-slate-500 font-medium">Resolved</span>
                        </>
                      )}
                    </div>

                    <p className="text-sm font-medium text-slate-900">{notif.message}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {linkedOrder && linkedOrder.status === 'pending_approval' && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === notif.id}
                          onClick={() => void handleRejectFromAlert(notif, linkedOrder)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg whitespace-nowrap"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject Order
                        </button>
                        <button
                          type="button"
                          disabled={busyId === notif.id}
                          onClick={() => void handleApproveFromAlert(notif, linkedOrder)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve Order
                        </button>
                      </>
                    )}

                    {notif.alertType === 'expired' &&
                      linkedMed &&
                      !linkedMed.disposed && (
                        <button
                          type="button"
                          disabled={busyId === notif.id}
                          onClick={() => void handleDisposeFromAlert(notif, linkedMed)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Dispose Stock
                        </button>
                      )}

                    {!notif.read && (
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(ownerId, notif.id)}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
