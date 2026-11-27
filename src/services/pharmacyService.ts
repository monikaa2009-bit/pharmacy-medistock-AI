import {
  collection,
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type AlertNotification,
  type Medicine,
  type PharmacyProfile,
  type SupplierOrder,
} from '../types/pharmacy';
import { getDaysUntilExpiry } from '../utils/inventoryLogic';

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function makeOrderRef(): string {
  const code = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `PO-${new Date().getFullYear()}-${code}`;
}

export interface PharmacyProfileInput {
  pharmacyName: string;
  ownerName: string;
  ownerEmail: string;
  licenseNumber: string;
  phone: string;
  address: string;
  expiryAlertDays: number;
}

export async function savePharmacyProfile(
  ownerId: string,
  input: PharmacyProfileInput,
  isUpdate: boolean
): Promise<void> {
  const path = `pharmacies/${ownerId}`;
  const pharmacyName = input.pharmacyName.trim().slice(0, BLUEPRINT_LIMITS.MAX_PHARMACY_NAME);
  const ownerName = input.ownerName.trim().slice(0, BLUEPRINT_LIMITS.MAX_OWNER_NAME);
  const ownerEmail = input.ownerEmail.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL);
  const licenseNumber = input.licenseNumber.trim().slice(0, BLUEPRINT_LIMITS.MAX_LICENSE);
  const phone = input.phone.trim().slice(0, BLUEPRINT_LIMITS.MAX_PHONE);
  const address = input.address.trim().slice(0, BLUEPRINT_LIMITS.MAX_ADDRESS);
  const expiryAlertDays = Math.min(180, Math.max(7, Math.round(Number(input.expiryAlertDays) || 30)));

  if (pharmacyName.length < 2) throw new Error('Pharmacy name must be at least 2 characters.');
  if (ownerName.length < 2) throw new Error('Owner name must be at least 2 characters.');

  try {
    const ref = doc(db, 'pharmacies', ownerId);
    if (isUpdate) {
      await updateDoc(ref, {
        pharmacyName,
        ownerName,
        licenseNumber,
        phone,
        address,
        expiryAlertDays,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ownerId,
        pharmacyName,
        ownerName,
        ownerEmail,
        licenseNumber,
        phone,
        address,
        expiryAlertDays,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export interface MedicineInput {
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
}

export function validateMedicineInput(
  input: MedicineInput,
  existingMedicines: Medicine[],
  editingMedicineId?: string
): MedicineInput {
  const name = input.name.trim().slice(0, BLUEPRINT_LIMITS.MAX_MED_NAME);
  const barcode = input.barcode.trim().slice(0, BLUEPRINT_LIMITS.MAX_BARCODE);
  const batchNumber = input.batchNumber.trim().slice(0, BLUEPRINT_LIMITS.MAX_BATCH);
  const category = (input.category.trim() || 'General').slice(0, BLUEPRINT_LIMITS.MAX_CATEGORY);
  const manufacturingDate = input.manufacturingDate.trim();
  const expiryDate = input.expiryDate.trim();
  const supplierName = input.supplierName.trim().slice(0, BLUEPRINT_LIMITS.MAX_SUPPLIER_NAME);
  const supplierEmail = input.supplierEmail.trim().slice(0, BLUEPRINT_LIMITS.MAX_EMAIL);
  const supplierPhone = input.supplierPhone.trim().slice(0, BLUEPRINT_LIMITS.MAX_PHONE);

  const quantity = Math.round(Number(input.quantity));
  const minStockLevel = Math.round(Number(input.minStockLevel));
  const unitPrice = Number(Number(input.unitPrice).toFixed(2));

  if (!name) throw new Error('Medicine name is required.');
  if (barcode.length < 3 || !BLUEPRINT_LIMITS.BARCODE_REGEX.test(barcode)) {
    throw new Error('Barcode must be 3–64 characters using letters, numbers, hyphens, or underscores.');
  }
  if (!batchNumber || !BLUEPRINT_LIMITS.BATCH_REGEX.test(batchNumber)) {
    throw new Error('Batch number must use letters, numbers, hyphens, or underscores.');
  }
  if (!BLUEPRINT_LIMITS.DATE_REGEX.test(manufacturingDate) || !BLUEPRINT_LIMITS.DATE_REGEX.test(expiryDate)) {
    throw new Error('Manufacturing and expiry dates must be valid YYYY-MM-DD dates.');
  }
  if (manufacturingDate >= expiryDate) {
    throw new Error('Expiry date must be strictly after the manufacturing date.');
  }
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000) {
    throw new Error('Quantity must be a whole number between 0 and 1,000,000.');
  }
  if (!Number.isInteger(minStockLevel) || minStockLevel < 0 || minStockLevel > 100000) {
    throw new Error('Minimum stock level must be a whole number between 0 and 100,000.');
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0 || unitPrice > 1000000) {
    throw new Error('Unit price must be greater than 0.');
  }
  if (!supplierName) throw new Error('Supplier name is required.');

  const duplicate = existingMedicines.find(
    (m) =>
      m.id !== editingMedicineId &&
      m.barcode.toLowerCase() === barcode.toLowerCase() &&
      m.batchNumber.toLowerCase() === batchNumber.toLowerCase()
  );
  if (duplicate) {
    throw new Error(
      `Duplicate entry blocked: "${duplicate.name}" with barcode ${barcode} and batch ${batchNumber} already exists.`
    );
  }

  return {
    name,
    barcode,
    batchNumber,
    category,
    manufacturingDate,
    expiryDate,
    quantity,
    minStockLevel,
    unitPrice,
    supplierName,
    supplierEmail,
    supplierPhone,
  };
}

export async function addMedicineBatch(
  ownerId: string,
  rawInput: MedicineInput,
  existingMedicines: Medicine[],
  expiryAlertDays: number
): Promise<string> {
  const clean = validateMedicineInput(rawInput, existingMedicines);
  const medicineId = makeSafeId('med');
  const medPath = `pharmacies/${ownerId}/medicines/${medicineId}`;

  try {
    const batch = writeBatch(db);
    const medRef = doc(db, 'pharmacies', ownerId, 'medicines', medicineId);

    batch.set(medRef, {
      id: medicineId,
      ownerId,
      ...clean,
      disposed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (clean.quantity > 0) {
      const mvId = makeSafeId('mov');
      const mvRef = doc(db, 'pharmacies', ownerId, 'movements', mvId);
      batch.set(mvRef, {
        id: mvId,
        ownerId,
        medicineId,
        medicineName: clean.name,
        barcode: clean.barcode,
        batchNumber: clean.batchNumber,
        type: 'initial',
        quantityDelta: clean.quantity,
        quantityAfter: clean.quantity,
        unitPrice: clean.unitPrice,
        totalAmount: Number((clean.quantity * clean.unitPrice).toFixed(2)),
        note: `Initial intake for batch ${clean.batchNumber}`,
        createdAt: serverTimestamp(),
      });
    }

    const daysUntilExpiry = getDaysUntilExpiry(clean.expiryDate);

    if (daysUntilExpiry <= 0) {
      const notifId = makeSafeId('alt');
      batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
        id: notifId,
        ownerId,
        medicineId,
        medicineName: clean.name,
        alertType: 'expired',
        severity: 'red',
        message: `Expired alert: Batch ${clean.batchNumber} of ${clean.name} (${clean.quantity} units) is past its expiry date (${clean.expiryDate}) and cannot be sold.`,
        orderId: '',
        read: false,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (daysUntilExpiry <= expiryAlertDays && clean.quantity > 0) {
      const notifId = makeSafeId('alt');
      batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
        id: notifId,
        ownerId,
        medicineId,
        medicineName: clean.name,
        alertType: 'expiry_approaching',
        severity: 'orange',
        message: `Warning! ${clean.quantity} units of ${clean.name} will expire in ${daysUntilExpiry} days. Please sell or manage the stock before the expiry date.`,
        orderId: '',
        read: false,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    if (daysUntilExpiry > 0 && clean.quantity <= clean.minStockLevel) {
      const orderId = makeSafeId('ord');
      const suggestedQty = Math.max(clean.minStockLevel * 3, 25);
      const unitCost = Number((clean.unitPrice * 0.7).toFixed(2));
      batch.set(doc(db, 'pharmacies', ownerId, 'orders', orderId), {
        id: orderId,
        ownerId,
        medicineId,
        medicineName: clean.name,
        barcode: clean.barcode,
        currentStockAtTrigger: clean.quantity,
        orderQuantity: suggestedQty,
        unitCost,
        totalCost: Number((suggestedQty * unitCost).toFixed(2)),
        supplierName: clean.supplierName,
        supplierEmail: clean.supplierEmail,
        supplierPhone: clean.supplierPhone,
        status: 'pending_approval',
        deliveryStatusText: 'Awaiting owner approval',
        referenceNumber: makeOrderRef(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const notifId = makeSafeId('alt');
      batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
        id: notifId,
        ownerId,
        medicineId,
        medicineName: clean.name,
        alertType: 'low_stock',
        severity: 'yellow',
        message: `${clean.name} stock is running low. Only ${clean.quantity} units are remaining. Do you want to reorder?`,
        orderId,
        read: false,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return medicineId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, medPath);
  }
}

export async function updateMedicineMetadata(
  ownerId: string,
  existingMed: Medicine,
  rawInput: MedicineInput,
  existingMedicines: Medicine[]
): Promise<void> {
  const clean = validateMedicineInput(rawInput, existingMedicines, existingMed.id);
  const medPath = `pharmacies/${ownerId}/medicines/${existingMed.id}`;
  try {
    await updateDoc(doc(db, 'pharmacies', ownerId, 'medicines', existingMed.id), {
      name: clean.name,
      barcode: clean.barcode,
      batchNumber: clean.batchNumber,
      category: clean.category,
      manufacturingDate: clean.manufacturingDate,
      expiryDate: clean.expiryDate,
      minStockLevel: clean.minStockLevel,
      unitPrice: clean.unitPrice,
      supplierName: clean.supplierName,
      supplierEmail: clean.supplierEmail,
      supplierPhone: clean.supplierPhone,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, medPath);
  }
}

export async function deleteMedicineBatch(ownerId: string, medicineId: string): Promise<void> {
  const medPath = `pharmacies/${ownerId}/medicines/${medicineId}`;
  try {
    await deleteDoc(doc(db, 'pharmacies', ownerId, 'medicines', medicineId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, medPath);
  }
}

export async function dispenseMedicineSale(
  ownerId: string,
  medicine: Medicine,
  sellQuantity: number,
  saleNote: string,
  existingOrders: SupplierOrder[]
): Promise<{ newQuantity: number; triggeredReorder: boolean }> {
  const qtyToSell = Math.round(Number(sellQuantity));
  if (!Number.isInteger(qtyToSell) || qtyToSell <= 0) {
    throw new Error('Sale quantity must be at least 1 unit.');
  }

  const daysUntilExpiry = getDaysUntilExpiry(medicine.expiryDate);
  if (medicine.disposed || daysUntilExpiry <= 0) {
    throw new Error(
      `Sale blocked: ${medicine.name} (Batch ${medicine.batchNumber}) is expired (${medicine.expiryDate}) and cannot be dispensed.`
    );
  }

  const medPath = `pharmacies/${ownerId}/medicines/${medicine.id}`;
  const hasOpenOrder = existingOrders.some(
    (o) =>
      o.medicineId === medicine.id &&
      (o.status === 'pending_approval' || o.status === 'ordered' || o.status === 'in_transit')
  );

  try {
    let finalQty = 0;
    let triggeredReorder = false;

    await runTransaction(db, async (tx) => {
      const medRef = doc(db, 'pharmacies', ownerId, 'medicines', medicine.id);
      const medSnap = await tx.get(medRef);
      if (!medSnap.exists()) {
        throw new Error('Medicine record no longer exists.');
      }

      const current = medSnap.data() as Medicine;
      if (current.disposed || getDaysUntilExpiry(current.expiryDate) <= 0) {
        throw new Error('Sale blocked: this medicine batch has expired.');
      }
      if (current.quantity < qtyToSell) {
        throw new Error(`Insufficient stock. Only ${current.quantity} units available.`);
      }

      finalQty = current.quantity - qtyToSell;

      tx.update(medRef, {
        quantity: finalQty,
        updatedAt: serverTimestamp(),
      });

      const mvId = makeSafeId('mov');
      const mvRef = doc(db, 'pharmacies', ownerId, 'movements', mvId);
      tx.set(mvRef, {
        id: mvId,
        ownerId,
        medicineId: current.id,
        medicineName: current.name,
        barcode: current.barcode,
        batchNumber: current.batchNumber,
        type: 'sale',
        quantityDelta: -qtyToSell,
        quantityAfter: finalQty,
        unitPrice: current.unitPrice,
        totalAmount: Number((qtyToSell * current.unitPrice).toFixed(2)),
        note: (saleNote.trim() || `Dispensed ${qtyToSell} units`).slice(0, BLUEPRINT_LIMITS.MAX_NOTE),
        createdAt: serverTimestamp(),
      });

      if (finalQty <= current.minStockLevel && !hasOpenOrder) {
        triggeredReorder = true;
        const orderId = makeSafeId('ord');
        const suggestedQty = Math.max(current.minStockLevel * 3, 25);
        const unitCost = Number((current.unitPrice * 0.7).toFixed(2));

        tx.set(doc(db, 'pharmacies', ownerId, 'orders', orderId), {
          id: orderId,
          ownerId,
          medicineId: current.id,
          medicineName: current.name,
          barcode: current.barcode,
          currentStockAtTrigger: finalQty,
          orderQuantity: suggestedQty,
          unitCost,
          totalCost: Number((suggestedQty * unitCost).toFixed(2)),
          supplierName: current.supplierName,
          supplierEmail: current.supplierEmail,
          supplierPhone: current.supplierPhone,
          status: 'pending_approval',
          deliveryStatusText: 'Awaiting owner approval',
          referenceNumber: makeOrderRef(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const notifId = makeSafeId('alt');
        tx.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
          id: notifId,
          ownerId,
          medicineId: current.id,
          medicineName: current.name,
          alertType: 'low_stock',
          severity: 'yellow',
          message: `${current.name} stock is running low. Only ${finalQty} units are remaining. Do you want to reorder?`,
          orderId,
          read: false,
          resolved: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    });

    return { newQuantity: finalQty, triggeredReorder };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Sale blocked') || error.message.includes('Insufficient stock') || error.message.includes('no longer exists'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, medPath);
  }
}

export async function disposeExpiredBatch(
  ownerId: string,
  medicine: Medicine,
  notifications: AlertNotification[]
): Promise<void> {
  const medPath = `pharmacies/${ownerId}/medicines/${medicine.id}`;
  try {
    const batch = writeBatch(db);
    const medRef = doc(db, 'pharmacies', ownerId, 'medicines', medicine.id);

    batch.update(medRef, {
      disposed: true,
      quantity: 0,
      updatedAt: serverTimestamp(),
    });

    if (medicine.quantity > 0) {
      const mvId = makeSafeId('mov');
      batch.set(doc(db, 'pharmacies', ownerId, 'movements', mvId), {
        id: mvId,
        ownerId,
        medicineId: medicine.id,
        medicineName: medicine.name,
        barcode: medicine.barcode,
        batchNumber: medicine.batchNumber,
        type: 'expired_disposal',
        quantityDelta: -medicine.quantity,
        quantityAfter: 0,
        unitPrice: medicine.unitPrice,
        totalAmount: Number((medicine.quantity * medicine.unitPrice).toFixed(2)),
        note: `Quarantined & disposed expired batch ${medicine.batchNumber} (${medicine.expiryDate})`,
        createdAt: serverTimestamp(),
      });
    }

    for (const notif of notifications) {
      if (
        notif.medicineId === medicine.id &&
        !notif.resolved &&
        (notif.alertType === 'expired' || notif.alertType === 'expiry_approaching')
      ) {
        batch.update(doc(db, 'pharmacies', ownerId, 'notifications', notif.id), {
          read: true,
          resolved: true,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, medPath);
  }
}

export async function approveSupplierOrder(
  ownerId: string,
  order: SupplierOrder,
  approvedQty: number,
  notifications: AlertNotification[]
): Promise<void> {
  const qty = Math.round(Number(approvedQty));
  if (!Number.isInteger(qty) || qty < 1 || qty > 100000) {
    throw new Error('Order quantity must be between 1 and 100,000 units.');
  }
  const orderPath = `pharmacies/${ownerId}/orders/${order.id}`;

  try {
    const batch = writeBatch(db);
    const orderRef = doc(db, 'pharmacies', ownerId, 'orders', order.id);
    const newTotal = Number((qty * order.unitCost).toFixed(2));

    batch.update(orderRef, {
      status: 'ordered',
      orderQuantity: qty,
      totalCost: newTotal,
      deliveryStatusText: `Order confirmed & placed with ${order.supplierName}`.slice(0, BLUEPRINT_LIMITS.MAX_DELIVERY_STATUS),
      updatedAt: serverTimestamp(),
    });

    for (const notif of notifications) {
      if (notif.orderId === order.id && !notif.resolved) {
        batch.update(doc(db, 'pharmacies', ownerId, 'notifications', notif.id), {
          read: true,
          resolved: true,
          updatedAt: serverTimestamp(),
        });
      }
    }

    const confirmId = makeSafeId('alt');
    batch.set(doc(db, 'pharmacies', ownerId, 'notifications', confirmId), {
      id: confirmId,
      ownerId,
      medicineId: order.medicineId,
      medicineName: order.medicineName,
      alertType: 'order_update',
      severity: 'green',
      message: `Order ${order.referenceNumber} approved: ${qty} units of ${order.medicineName} ordered from ${order.supplierName}.`,
      orderId: order.id,
      read: false,
      resolved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orderPath);
  }
}

export async function rejectSupplierOrder(
  ownerId: string,
  order: SupplierOrder,
  notifications: AlertNotification[]
): Promise<void> {
  const orderPath = `pharmacies/${ownerId}/orders/${order.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'pharmacies', ownerId, 'orders', order.id), {
      status: 'rejected',
      deliveryStatusText: 'Rejected by pharmacy owner — no order placed',
      updatedAt: serverTimestamp(),
    });

    for (const notif of notifications) {
      if (notif.orderId === order.id && !notif.resolved) {
        batch.update(doc(db, 'pharmacies', ownerId, 'notifications', notif.id), {
          read: true,
          resolved: true,
          updatedAt: serverTimestamp(),
        });
      }
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orderPath);
  }
}

export async function advanceOrderDelivery(
  ownerId: string,
  order: SupplierOrder,
  nextStatus: 'in_transit' | 'completed'
): Promise<void> {
  const orderPath = `pharmacies/${ownerId}/orders/${order.id}`;
  try {
    if (nextStatus === 'in_transit') {
      await updateDoc(doc(db, 'pharmacies', ownerId, 'orders', order.id), {
        status: 'in_transit',
        deliveryStatusText: `In transit from ${order.supplierName}`.slice(0, BLUEPRINT_LIMITS.MAX_DELIVERY_STATUS),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    await runTransaction(db, async (tx) => {
      const orderRef = doc(db, 'pharmacies', ownerId, 'orders', order.id);
      const medRef = doc(db, 'pharmacies', ownerId, 'medicines', order.medicineId);
      const medSnap = await tx.get(medRef);

      tx.update(orderRef, {
        status: 'completed',
        deliveryStatusText: 'Delivered & added to available stock',
        updatedAt: serverTimestamp(),
      });

      if (medSnap.exists()) {
        const med = medSnap.data() as Medicine;
        const newQty = med.quantity + order.orderQuantity;
        tx.update(medRef, {
          quantity: newQty,
          updatedAt: serverTimestamp(),
        });

        const mvId = makeSafeId('mov');
        tx.set(doc(db, 'pharmacies', ownerId, 'movements', mvId), {
          id: mvId,
          ownerId,
          medicineId: med.id,
          medicineName: med.name,
          barcode: med.barcode,
          batchNumber: med.batchNumber,
          type: 'restock',
          quantityDelta: order.orderQuantity,
          quantityAfter: newQty,
          unitPrice: order.unitCost,
          totalAmount: order.totalCost,
          note: `Supplier delivery received (${order.referenceNumber} from ${order.supplierName})`.slice(0, BLUEPRINT_LIMITS.MAX_NOTE),
          createdAt: serverTimestamp(),
        });
      }

      const notifId = makeSafeId('alt');
      tx.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
        id: notifId,
        ownerId,
        medicineId: order.medicineId,
        medicineName: order.medicineName,
        alertType: 'order_update',
        severity: 'green',
        message: `Delivery completed (${order.referenceNumber}): +${order.orderQuantity} units of ${order.medicineName} restocked.`,
        orderId: order.id,
        read: false,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orderPath);
  }
}

export async function requestManualReorder(
  ownerId: string,
  medicine: Medicine,
  orderQuantity: number
): Promise<void> {
  const qty = Math.round(Number(orderQuantity));
  if (!Number.isInteger(qty) || qty < 1) {
    throw new Error('Reorder quantity must be at least 1.');
  }
  const orderId = makeSafeId('ord');
  const orderPath = `pharmacies/${ownerId}/orders/${orderId}`;
  const unitCost = Number((medicine.unitPrice * 0.7).toFixed(2));

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'pharmacies', ownerId, 'orders', orderId), {
      id: orderId,
      ownerId,
      medicineId: medicine.id,
      medicineName: medicine.name,
      barcode: medicine.barcode,
      currentStockAtTrigger: medicine.quantity,
      orderQuantity: qty,
      unitCost,
      totalCost: Number((qty * unitCost).toFixed(2)),
      supplierName: medicine.supplierName,
      supplierEmail: medicine.supplierEmail,
      supplierPhone: medicine.supplierPhone,
      status: 'pending_approval',
      deliveryStatusText: 'Awaiting owner approval',
      referenceNumber: makeOrderRef(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const notifId = makeSafeId('alt');
    batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
      id: notifId,
      ownerId,
      medicineId: medicine.id,
      medicineName: medicine.name,
      alertType: 'low_stock',
      severity: 'yellow',
      message: `${medicine.name} reorder queued (${medicine.quantity} units remaining). Approve or reject order ${orderId.slice(-4)}?`,
      orderId,
      read: false,
      resolved: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, orderPath);
  }
}

export async function syncAutomaticAlerts(
  ownerId: string,
  medicines: Medicine[],
  notifications: AlertNotification[],
  orders: SupplierOrder[],
  profile: PharmacyProfile
): Promise<void> {
  const path = `pharmacies/${ownerId}/notifications`;
  const batch = writeBatch(db);
  let hasWrites = false;

  for (const med of medicines) {
    if (med.disposed) continue;
    const days = getDaysUntilExpiry(med.expiryDate);

    if (days <= 0) {
      const existsExpired = notifications.some(
        (n) => n.medicineId === med.id && n.alertType === 'expired' && !n.resolved
      );
      if (!existsExpired) {
        hasWrites = true;
        const notifId = makeSafeId('alt');
        batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
          id: notifId,
          ownerId,
          medicineId: med.id,
          medicineName: med.name,
          alertType: 'expired',
          severity: 'red',
          message: `Expired medicine alert: ${med.quantity} units of ${med.name} (Batch ${med.batchNumber}) expired on ${med.expiryDate}. Removed from sellable stock.`,
          orderId: '',
          read: false,
          resolved: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } else if (days <= profile.expiryAlertDays && med.quantity > 0) {
      const existsExpiring = notifications.some(
        (n) => n.medicineId === med.id && n.alertType === 'expiry_approaching' && !n.resolved
      );
      if (!existsExpiring) {
        hasWrites = true;
        const notifId = makeSafeId('alt');
        batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
          id: notifId,
          ownerId,
          medicineId: med.id,
          medicineName: med.name,
          alertType: 'expiry_approaching',
          severity: 'orange',
          message: `Warning! ${med.quantity} units of ${med.name} will expire in ${days} days. Please sell or manage the stock before the expiry date.`,
          orderId: '',
          read: false,
          resolved: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    if (days > 0 && med.quantity <= med.minStockLevel) {
      const hasOpenOrder = orders.some(
        (o) =>
          o.medicineId === med.id &&
          (o.status === 'pending_approval' || o.status === 'ordered' || o.status === 'in_transit')
      );
      const hasOpenNotif = notifications.some(
        (n) => n.medicineId === med.id && n.alertType === 'low_stock' && !n.resolved
      );
      if (!hasOpenOrder && !hasOpenNotif) {
        hasWrites = true;
        const orderId = makeSafeId('ord');
        const suggestedQty = Math.max(med.minStockLevel * 3, 25);
        const unitCost = Number((med.unitPrice * 0.7).toFixed(2));
        batch.set(doc(db, 'pharmacies', ownerId, 'orders', orderId), {
          id: orderId,
          ownerId,
          medicineId: med.id,
          medicineName: med.name,
          barcode: med.barcode,
          currentStockAtTrigger: med.quantity,
          orderQuantity: suggestedQty,
          unitCost,
          totalCost: Number((suggestedQty * unitCost).toFixed(2)),
          supplierName: med.supplierName,
          supplierEmail: med.supplierEmail,
          supplierPhone: med.supplierPhone,
          status: 'pending_approval',
          deliveryStatusText: 'Awaiting owner approval',
          referenceNumber: makeOrderRef(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const notifId = makeSafeId('alt');
        batch.set(doc(db, 'pharmacies', ownerId, 'notifications', notifId), {
          id: notifId,
          ownerId,
          medicineId: med.id,
          medicineName: med.name,
          alertType: 'low_stock',
          severity: 'yellow',
          message: `${med.name} stock is running low. Only ${med.quantity} units are remaining. Do you want to reorder?`,
          orderId,
          read: false,
          resolved: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  }

  if (hasWrites) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function markNotificationRead(ownerId: string, notificationId: string): Promise<void> {
  const path = `pharmacies/${ownerId}/notifications/${notificationId}`;
  try {
    await updateDoc(doc(db, 'pharmacies', ownerId, 'notifications', notificationId), {
      read: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function markAllNotificationsRead(
  ownerId: string,
  notifications: AlertNotification[]
): Promise<void> {
  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) return;
  const path = `pharmacies/${ownerId}/notifications`;
  try {
    const batch = writeBatch(db);
    for (const n of unread) {
      batch.update(doc(db, 'pharmacies', ownerId, 'notifications', n.id), {
        read: true,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
