import type { Timestamp } from 'firebase/firestore';

export const BLUEPRINT_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  BARCODE_REGEX: /^[a-zA-Z0-9_-]+$/,
  BATCH_REGEX: /^[a-zA-Z0-9_-]+$/,
  DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  MAX_ID_LEN: 128,
  MAX_PHARMACY_NAME: 120,
  MAX_OWNER_NAME: 100,
  MAX_EMAIL: 150,
  MAX_LICENSE: 60,
  MAX_PHONE: 30,
  MAX_ADDRESS: 240,
  MAX_MED_NAME: 140,
  MAX_BARCODE: 64,
  MAX_BATCH: 64,
  MAX_CATEGORY: 60,
  MAX_SUPPLIER_NAME: 120,
  MAX_NOTE: 240,
  MAX_DELIVERY_STATUS: 120,
  MAX_REF: 40,
  MAX_ALERT_MSG: 320,
} as const;

export interface PharmacyProfile {
  ownerId: string;
  pharmacyName: string;
  ownerName: string;
  ownerEmail: string;
  licenseNumber: string;
  phone: string;
  address: string;
  expiryAlertDays: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Medicine {
  id: string;
  ownerId: string;
  name: string;
  barcode: string;
  batchNumber: string;
  category: string;
  manufacturingDate: string;
  expiryDate: string;
  quantity: number;
  minStockLevel: number;
  unitPrice: number;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  disposed: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type StockMovementType =
  | 'initial'
  | 'sale'
  | 'restock'
  | 'adjustment'
  | 'expired_disposal';

export interface StockMovement {
  id: string;
  ownerId: string;
  medicineId: string;
  medicineName: string;
  barcode: string;
  batchNumber: string;
  type: StockMovementType;
  quantityDelta: number;
  quantityAfter: number;
  unitPrice: number;
  totalAmount: number;
  note: string;
  createdAt?: Timestamp;
}

export type OrderStatus =
  | 'pending_approval'
  | 'ordered'
  | 'in_transit'
  | 'completed'
  | 'rejected';

export interface SupplierOrder {
  id: string;
  ownerId: string;
  medicineId: string;
  medicineName: string;
  barcode: string;
  currentStockAtTrigger: number;
  orderQuantity: number;
  unitCost: number;
  totalCost: number;
  supplierName: string;
  supplierEmail: string;
  supplierPhone: string;
  status: OrderStatus;
  deliveryStatusText: string;
  referenceNumber: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type AlertType =
  | 'low_stock'
  | 'expiry_approaching'
  | 'expired'
  | 'order_update';

export type AlertSeverity = 'green' | 'yellow' | 'orange' | 'red';

export interface AlertNotification {
  id: string;
  ownerId: string;
  medicineId: string;
  medicineName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  orderId: string;
  read: boolean;
  resolved: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export type MedicineHealthStatus =
  | 'sufficient'
  | 'low_stock'
  | 'expiring_soon'
  | 'expired';

export interface ClassifiedMedicine {
  medicine: Medicine;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isLowStock: boolean;
  isAvailable: boolean;
  primaryStatus: MedicineHealthStatus;
  severity: AlertSeverity;
  statusLabel: string;
}

export type NavTab =
  | 'dashboard'
  | 'inventory'
  | 'orders'
  | 'alerts'
  | 'reports'
  | 'settings';
