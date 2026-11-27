import assert from 'node:assert/strict';

type MockContext = {
  uid: string | null;
  emailVerified: boolean;
  pharmacyExists: boolean;
  serverTime: string;
};

const ID_RE = /^[a-zA-Z0-9_-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function canCreateMedicine(
  ctx: MockContext,
  pathOwnerId: string,
  medicineId: string,
  data: Record<string, unknown>
): boolean {
  if (!ctx.uid || !ctx.emailVerified) return false;
  if (ctx.uid !== pathOwnerId) return false;
  if (!ID_RE.test(pathOwnerId) || pathOwnerId.length > 128) return false;
  if (!ID_RE.test(medicineId) || medicineId.length > 128) return false;
  if (!ctx.pharmacyExists) return false;

  const required = [
    'id', 'ownerId', 'name', 'barcode', 'batchNumber', 'category',
    'manufacturingDate', 'expiryDate', 'quantity', 'minStockLevel',
    'unitPrice', 'supplierName', 'supplierEmail', 'supplierPhone',
    'disposed', 'createdAt', 'updatedAt',
  ];
  const keys = Object.keys(data);
  if (!required.every((k) => keys.includes(k))) return false;
  if (!keys.every((k) => required.includes(k))) return false;
  if (data.id !== medicineId || data.ownerId !== pathOwnerId) return false;
  if (typeof data.manufacturingDate !== 'string' || !DATE_RE.test(data.manufacturingDate)) return false;
  if (typeof data.expiryDate !== 'string' || !DATE_RE.test(data.expiryDate)) return false;
  if (data.manufacturingDate >= data.expiryDate) return false;
  if (typeof data.quantity !== 'number' || !Number.isInteger(data.quantity) || data.quantity < 0) return false;
  if (typeof data.unitPrice !== 'number' || data.unitPrice <= 0) return false;
  if (data.createdAt !== ctx.serverTime || data.updatedAt !== ctx.serverTime) return false;
  return true;
}

function canCreateOrder(
  ctx: MockContext,
  pathOwnerId: string,
  orderId: string,
  data: Record<string, unknown>
): boolean {
  if (!ctx.uid || !ctx.emailVerified || ctx.uid !== pathOwnerId || !ctx.pharmacyExists) return false;
  if (!ID_RE.test(orderId) || orderId.length > 128) return false;
  return data.status === 'pending_approval' && data.ownerId === pathOwnerId && data.id === orderId;
}

function canUpdateOrder(
  ctx: MockContext,
  pathOwnerId: string,
  existingStatus: string,
  incomingStatus: string,
  affectedKeys: string[]
): boolean {
  if (!ctx.uid || !ctx.emailVerified || ctx.uid !== pathOwnerId || !ctx.pharmacyExists) return false;
  if (existingStatus === 'completed' || existingStatus === 'rejected') return false;
  if (existingStatus === 'pending_approval' && incomingStatus === 'ordered') {
    return affectedKeys.every((k) => ['status', 'orderQuantity', 'totalCost', 'deliveryStatusText', 'updatedAt'].includes(k));
  }
  if (existingStatus === 'pending_approval' && incomingStatus === 'rejected') {
    return affectedKeys.every((k) => ['status', 'deliveryStatusText', 'updatedAt'].includes(k));
  }
  return false;
}

export function runDirtyDozenChecks() {
  const validCtx: MockContext = {
    uid: 'owner_1',
    emailVerified: true,
    pharmacyExists: true,
    serverTime: 'SERVER_TIME',
  };

  const baseMed = {
    id: 'med_1',
    ownerId: 'owner_1',
    name: 'Paracetamol 500mg',
    barcode: '8901234567890',
    batchNumber: 'BCH_2026_01',
    category: 'Analgesic',
    manufacturingDate: '2026-01-10',
    expiryDate: '2028-01-10',
    quantity: 50,
    minStockLevel: 10,
    unitPrice: 4.5,
    supplierName: 'MedCore Pharma',
    supplierEmail: 'orders@medcore.example',
    supplierPhone: '+1-555-0100',
    disposed: false,
    createdAt: 'SERVER_TIME',
    updatedAt: 'SERVER_TIME',
  };

  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', baseMed), true);
  // 1. Cross-tenant write denied
  assert.equal(canCreateMedicine({ ...validCtx, uid: 'owner_2' }, 'owner_1', 'med_1', baseMed), false);
  // 2. Unverified email spoof denied
  assert.equal(canCreateMedicine({ ...validCtx, emailVerified: false }, 'owner_1', 'med_1', baseMed), false);
  // 3. Ghost field injection denied
  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', { ...baseMed, isAdmin: true }), false);
  // 4. Shadow update on order denied
  assert.equal(canUpdateOrder(validCtx, 'owner_1', 'pending_approval', 'ordered', ['status', 'unitCost']), false);
  // 5. Identity spoofing in payload denied
  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', { ...baseMed, ownerId: 'owner_2' }), false);
  // 6. ID poisoning denied
  assert.equal(canCreateMedicine(validCtx, 'owner_1', '../admin', { ...baseMed, id: '../admin' }), false);
  // 7. Client timestamp forgery denied
  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', { ...baseMed, createdAt: '2020-01-01' }), false);
  // 8. Terminal order reversal denied
  assert.equal(canUpdateOrder(validCtx, 'owner_1', 'completed', 'pending_approval', ['status', 'updatedAt']), false);
  // 9. Order state shortcutting on create denied
  assert.equal(canCreateOrder(validCtx, 'owner_1', 'ord_1', { id: 'ord_1', ownerId: 'owner_1', status: 'completed' }), false);
  // 10. Negative stock / zero price denied
  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', { ...baseMed, quantity: -1 }), false);
  assert.equal(canCreateMedicine(validCtx, 'owner_1', 'med_1', { ...baseMed, unitPrice: 0 }), false);
  // 11. Orphaned write without pharmacy profile denied
  assert.equal(canCreateMedicine({ ...validCtx, pharmacyExists: false }, 'owner_1', 'med_1', baseMed), false);
}
