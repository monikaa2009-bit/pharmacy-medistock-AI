import { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ScanBarcode,
  Search,
  Settings,
  ShoppingBag,
  Truck,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import type {
  AlertNotification,
  Medicine,
  NavTab,
  PharmacyProfile,
  StockMovement,
  SupplierOrder,
} from './types/pharmacy';
import { syncAutomaticAlerts } from './services/pharmacyService';
import { AddEditMedicineModal } from './components/AddEditMedicineModal';
import { AlertsView } from './components/AlertsView';
import { AuthGate } from './components/AuthGate';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { DispenseSaleModal } from './components/DispenseSaleModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InventoryView } from './components/InventoryView';
import { OrdersView } from './components/OrdersView';
import { OverviewDashboard } from './components/OverviewDashboard';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';

function MediStockWorkspace() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PharmacyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [scannedBarcodeForAdd, setScannedBarcodeForAdd] = useState('');
  const [intakeScannerOpen, setIntakeScannerOpen] = useState(false);

  const [dispenseModalOpen, setDispenseModalOpen] = useState(false);
  const [dispenseMedicineId, setDispenseMedicineId] = useState<string | null>(null);

  const syncingAlertsRef = useRef(false);

  // 1. Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (!firebaseUser) {
        setProfile(null);
        setProfileLoading(false);
        setMedicines([]);
        setOrders([]);
        setMovements([]);
        setNotifications([]);
      } else {
        setProfileLoading(true);
      }
    });
    return () => unsub();
  }, []);

  // 2. Pharmacy owner profile listener
  useEffect(() => {
    if (!authReady || !user) return;
    const profilePath = `pharmacies/${user.uid}`;
    const unsub = onSnapshot(
      doc(db, 'pharmacies', user.uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as PharmacyProfile);
        } else {
          setProfile(null);
        }
        setProfileLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, profilePath);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  // 3. Real-time Firestore collection listeners (only when registered profile exists)
  useEffect(() => {
    if (!authReady || !user || !profile) return;
    setDataLoading(true);
    const uid = user.uid;

    let loadedCount = 0;
    const markLoaded = () => {
      loadedCount += 1;
      if (loadedCount >= 4) setDataLoading(false);
    };

    const medsPath = `pharmacies/${uid}/medicines`;
    const unsubMeds = onSnapshot(
      query(collection(db, 'pharmacies', uid, 'medicines'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as Medicine)
          .sort((a, b) => a.name.localeCompare(b.name));
        setMedicines(list);
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, medsPath)
    );

    const ordersPath = `pharmacies/${uid}/orders`;
    const unsubOrders = onSnapshot(
      query(collection(db, 'pharmacies', uid, 'orders'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as SupplierOrder)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setOrders(list);
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, ordersPath)
    );

    const movementsPath = `pharmacies/${uid}/movements`;
    const unsubMovements = onSnapshot(
      query(collection(db, 'pharmacies', uid, 'movements'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as StockMovement)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setMovements(list);
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, movementsPath)
    );

    const notificationsPath = `pharmacies/${uid}/notifications`;
    const unsubNotifications = onSnapshot(
      query(collection(db, 'pharmacies', uid, 'notifications'), where('ownerId', '==', uid)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AlertNotification)
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setNotifications(list);
        markLoaded();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, notificationsPath)
    );

    return () => {
      unsubMeds();
      unsubOrders();
      unsubMovements();
      unsubNotifications();
    };
  }, [authReady, user, profile]);

  // 4. Real-time automatic expiry and low-stock alert synchronization
  useEffect(() => {
    if (!user || !profile || dataLoading || medicines.length === 0 || syncingAlertsRef.current) {
      return;
    }
    syncingAlertsRef.current = true;
    void syncAutomaticAlerts(user.uid, medicines, notifications, orders, profile).finally(() => {
      syncingAlertsRef.current = false;
    });
  }, [user, profile, dataLoading, medicines, notifications, orders]);

  const unreadAlertsCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const pendingApprovalsCount = useMemo(
    () => orders.filter((o) => o.status === 'pending_approval').length,
    [orders]
  );

  if (!authReady || (user && profileLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm font-medium text-slate-600">Loading MediStock AI...</div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <AuthGate
        user={user}
        needsRegistration={Boolean(user && !profile)}
        onRegistered={() => {
          // Profile snapshot listener automatically transitions into workspace
        }}
      />
    );
  }

  const navItems: { key: NavTab; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'inventory', label: 'Inventory', icon: Package, count: medicines.length },
    { key: 'orders', label: 'Supplier Orders', icon: Truck, count: pendingApprovalsCount || undefined },
    { key: 'alerts', label: 'Notifications', icon: Bell, count: unreadAlertsCount || undefined },
    { key: 'reports', label: 'Reports & Analytics', icon: BarChart3 },
    { key: 'settings', label: 'Pharmacy Settings', icon: Settings },
  ];

  const pageTitleMap: Record<NavTab, string> = {
    dashboard: 'Overview',
    inventory: 'Medicine Inventory',
    orders: 'Smart Reordering & Suppliers',
    alerts: 'Notifications & Alerts',
    reports: 'Reports & Analytics',
    settings: 'Pharmacy Settings',
  };

  const openAddManual = () => {
    setEditingMedicine(null);
    setScannedBarcodeForAdd('');
    setAddModalOpen(true);
  };

  const openEditMedicine = (med: Medicine) => {
    setEditingMedicine(med);
    setScannedBarcodeForAdd('');
    setAddModalOpen(true);
  };

  const openDispense = (medicineId?: string) => {
    setDispenseMedicineId(medicineId || null);
    setDispenseModalOpen(true);
  };

  const handleGlobalSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && activeTab !== 'inventory') {
      setActiveTab('inventory');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Navigation (260px) */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-150 lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 border-b border-slate-200 flex items-center justify-between gap-3">
            <span className="text-lg font-bold tracking-tight text-slate-900 font-display whitespace-nowrap">
              MediStock AI
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="p-1.5 text-slate-500 hover:text-slate-900 lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-900 truncate">{profile.pharmacyName}</p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{profile.ownerName}</p>
          </div>

          <nav className="p-3 space-y-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-50 text-teal-800 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`text-xs font-mono tabular-nums ${
                        item.key === 'orders' || item.key === 'alerts'
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-400'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-slate-200 space-y-2">
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Sign Out ({user.email})</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="p-2 -ml-2 text-slate-600 hover:text-slate-900 lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-400 hidden sm:inline truncate">
                {profile.pharmacyName}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">
                {pageTitleMap[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative hidden md:block w-56 lg:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleGlobalSearchKeyDown}
                placeholder="Search medicine or barcode..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <button
              type="button"
              onClick={() => setIntakeScannerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ScanBarcode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan Barcode</span>
            </button>

            <button
              type="button"
              onClick={() => openDispense()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Dispense Sale</span>
            </button>
          </div>
        </header>

        {/* Active Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <OverviewDashboard
              ownerId={user.uid}
              medicines={medicines}
              orders={orders}
              movements={movements}
              notifications={notifications}
              expiryAlertDays={profile.expiryAlertDays}
              loading={dataLoading}
              onNavigate={setActiveTab}
              onOpenAddMedicine={openAddManual}
              onOpenScanIntake={() => setIntakeScannerOpen(true)}
              onOpenDispense={openDispense}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              ownerId={user.uid}
              medicines={medicines}
              orders={orders}
              notifications={notifications}
              expiryAlertDays={profile.expiryAlertDays}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onOpenAddMedicine={openAddManual}
              onOpenScanIntake={() => setIntakeScannerOpen(true)}
              onOpenEditMedicine={openEditMedicine}
              onOpenDispense={openDispense}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              ownerId={user.uid}
              orders={orders}
              notifications={notifications}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertsView
              ownerId={user.uid}
              notifications={notifications}
              orders={orders}
              medicines={medicines}
            />
          )}

          {activeTab === 'reports' && (
            <ReportsView
              medicines={medicines}
              movements={movements}
              orders={orders}
              expiryAlertDays={profile.expiryAlertDays}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView ownerId={user.uid} profile={profile} />
          )}
        </main>
      </div>

      {/* Modals */}
      <AddEditMedicineModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        ownerId={user.uid}
        expiryAlertDays={profile.expiryAlertDays}
        existingMedicines={medicines}
        editingMedicine={editingMedicine}
        initialBarcode={scannedBarcodeForAdd}
      />

      <BarcodeScannerModal
        isOpen={intakeScannerOpen}
        onClose={() => setIntakeScannerOpen(false)}
        title="Scan Medicine Barcode for Inventory Intake"
        onDetected={(code) => {
          setEditingMedicine(null);
          setScannedBarcodeForAdd(code);
          setAddModalOpen(true);
        }}
      />

      <DispenseSaleModal
        isOpen={dispenseModalOpen}
        onClose={() => setDispenseModalOpen(false)}
        ownerId={user.uid}
        medicines={medicines}
        orders={orders}
        expiryAlertDays={profile.expiryAlertDays}
        initialMedicineId={dispenseMedicineId}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MediStockWorkspace />
    </ErrorBoundary>
  );
}
