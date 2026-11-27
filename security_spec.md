# MediStock AI — Security Specification (Phase 0)

## 1. Data Invariants

1. **Tenant Isolation (Owner Boundary)**: Every pharmacy profile (`/pharmacies/{ownerId}`) and all nested subcollections (`medicines`, `movements`, `orders`, `notifications`) belong exclusively to the verified user whose `request.auth.uid == ownerId` and `request.auth.token.email_verified == true`.
2. **Master Gate Parent Existence**: No `Medicine`, `StockMovement`, `SupplierOrder`, or `AlertNotification` document can be read individually or written unless the parent `/pharmacies/{ownerId}` document exists.
3. **Strict Schema & No Ghost Fields**: Every create operation enforces `keys().hasAll(...) && keys().hasOnly(...)`. Every update operation is wrapped in `isValid[Entity](incoming())` and uses explicit action branches with `affectedKeys().hasOnly(...)`.
4. **Immutable Audit Ledger**: `StockMovement` records are strictly append-only (`allow update, delete: if false;`) to preserve sales, restock, and disposal integrity.
5. **Approval-Gated Order Terminal Locking**: `SupplierOrder` documents start in `pending_approval` (or cannot skip directly to `completed` on creation). Once an order reaches a terminal state (`completed` or `rejected`), no further updates are permitted.
6. **Temporal & Identity Integrity**: `ownerId` and `createdAt` are immutable after creation. All `createdAt` (on create) and `updatedAt` (on create/update) fields must equal `request.time`.
7. **Expired Medicine Safety**: Medicines cannot be created with invalid dates or negative stock (`quantity >= 0`, `minStockLevel >= 0`, `unitPrice > 0`).

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Cross-Tenant Read/Write**: User B attempts to create or read a medicine under `/pharmacies/{userA_uid}/medicines/med_1`. -> `PERMISSION_DENIED`
2. **Unverified Email Spoof**: User with `email_verified: false` attempts to write to `/pharmacies/{uid}`. -> `PERMISSION_DENIED`
3. **Shadow / Ghost Field Injection on Create**: Creating a `Medicine` with an extra field `isAdminApproved: true`. -> `PERMISSION_DENIED`
4. **Shadow Update on Order**: Updating a `SupplierOrder` with `status: 'ordered'` plus extra `ownerId` or `unitCost` tampering. -> `PERMISSION_DENIED`
5. **Identity Spoofing in Payload**: Writing a `Medicine` under `/pharmacies/{uid}/medicines/med_1` where payload `ownerId` is `{otherUid}`. -> `PERMISSION_DENIED`
6. **Document ID Poisoning**: Creating a document with ID `../../admin` or a 1,500-character string. -> `PERMISSION_DENIED`
7. **Client Timestamp Forgery**: Creating a `Medicine` with `createdAt` set to a backdated client timestamp instead of `request.time`. -> `PERMISSION_DENIED`
8. **Ledger Tampering**: Attempting to `update` or `delete` an existing `StockMovement` record. -> `PERMISSION_DENIED`
9. **Terminal Order Reversal**: Attempting to update a `SupplierOrder` whose `existing().status` is `'completed'` or `'rejected'`. -> `PERMISSION_DENIED`
10. **Order State Shortcutting**: Creating a `SupplierOrder` directly with `status: 'completed'` to bypass owner approval. -> `PERMISSION_DENIED`
11. **Negative Stock / Price Poisoning**: Creating or updating a `Medicine` with `quantity: -5` or `unitPrice: 0`. -> `PERMISSION_DENIED`
12. **Orphaned Subcollection Write**: Attempting to create a `Medicine` before `/pharmacies/{uid}` profile exists. -> `PERMISSION_DENIED`

## 3. Test Runner

See `/firestore.rules.test.ts` for executable validation of all 12 adversarial payloads against the MediStock AI rule invariants.
