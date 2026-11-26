# Security Specification & Red-Team Audit Spec (Shared Team Workspace + Sales Tracking + Auto-Numbering + Payment Tracking)

## 1. Data Invariants
1. **Shared Workspace Scope**: Every document in `invoiceLogs`, `invoiceLogs/{logId}/items`, `bankAccounts`, and `invoiceCounters` must bind `ownerId` strictly to `'shared_team'` on creation and never allow `ownerId` or `createdAt` to mutate on update.
2. **Master Gate & Atomicity**: An `InvoiceLogItem` under `/invoiceLogs/{logId}/items/{itemId}` cannot exist without its parent `/invoiceLogs/{logId}` existing in the same batch (`existsAfter` + `getAfter` workspace owner match) or already committed (`exists` + `get` workspace owner match for chunked >8-item batches) and matching `incoming().logId == logId`.
3. **Sales, Payment Status & Payment Tracking Integrity**: Every `InvoiceLog` validates `salesName` (`<= 120` bytes), `paymentStatus` strictly within `['pending', 'paid', 'cancelled']`, `paidAtDate` (`''` or strictly `^([0-9]{4}-[0-9]{2}-[0-9]{2})?$`), and `paymentNote` (`<= 300` bytes). Updates to payment status, payment date, payment note, or salesName are isolated into strict `affectedKeys().hasOnly(...)` action branches guarded by `isValidInvoiceLog(incoming())`, optimized to stay safely under Firestore's 1,000-expression evaluation cap.
4. **Monotonic Per-PT Invoice Counter Integrity**: Every document in `/invoiceCounters/{counterId}` must declare valid `companyCode` (`^[A-Z0-9]{1,16}$`), `periodKey` (`^[0-9]{4}-[0-9]{2}$`), and non-negative integer `lastSequence` (`0..999999`). On update, `companyCode`, `periodKey`, `ownerId`, and `createdAt` are immutable, `lastSequence` can never decrease (`incoming().lastSequence >= existing().lastSequence`), and deletions are forbidden (`allow delete: if false`).
5. **No Unbounded Arrays**: Line items are stored in `/invoiceLogs/{logId}/items/{itemId}` rather than an unbounded array on the parent document, with optional `itemNote` (`<= 250` bytes) strictly validated alongside core item fields.
6. **Terminal State Locking**: Once an `InvoiceLog` has `status == 'archived'`, no further updates are permitted.
7. **Strict Timestamps & Bounds**: `createdAt` and `updatedAt` must equal `request.time` during creation/updates, all string fields enforce explicit `.size()` bounds, numbers enforce non-negative bounds, and document IDs match `^[a-zA-Z0-9_-]+$`.
8. **Self-Building Master Database (`/customers`, `/products`)**: Every record in `customers` and `products` binds `ownerId == 'shared_team'`, enforces strict `.size()` bounds (`name` 1..200, `address` <= 500, `orderUnit` 1..30, `usageCount` int 1..999999, `priceBasis` in `['per_kg', 'per_unit']`, non-negative `harga` & `weightPerUnit`), requires `createdAt == request.time` on create, keeps `ownerId` and `createdAt` immutable on update, and restricts updates to explicitly whitelisted keys via `affectedKeys().hasOnly(...)`.
9. **Default-Deny Safety Net**: All collections outside `invoiceLogs`, `invoiceLogs/{logId}/items`, `bankAccounts`, `invoiceCounters`, `customers`, and `products` are denied by default (`match /{document=**}`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unscoped Collection Access**: Reading or writing `/unknownCollection/doc1` or legacy `/userSettings/any`.
2. **Workspace Owner Spoofing**: Creating `/invoiceLogs/log_1`, `/customers/cust_1`, `/products/prod_1`, or `/invoiceCounters/counter_SRA_2026_11` with `ownerId: 'other_tenant'` instead of `'shared_team'`.
3. **Shadow Field Injection**: Creating or updating `/invoiceLogs/log_2`, `/customers/cust_1`, or `/products/prod_1` with an extra undeclared field `isVerified: true` or `bypassSeq: true`.
4. **Client Timestamp Forgery**: Creating `/invoiceLogs/log_3`, `/customers/cust_1`, or `/products/prod_1` with `createdAt` set to a past client date instead of `request.time`.
5. **ID Poisoning**: Creating `/invoiceLogs/invalid$id..slash`, `/customers/bad..id`, or a 300-char document ID.
6. **Resource Exhaustion (1MB String)**: Updating `paymentNote` (>300 bytes), `address` (>500 bytes), `name` (>200 bytes), or `logoDataUrl` (>100KB).
7. **Unfiltered List Query**: Calling `list` on `/invoiceLogs`, `/customers`, `/products`, or `/invoiceCounters` without filtering `ownerId == 'shared_team'`.
8. **Orphaned Subcollection Write**: Creating `/invoiceLogs/nonexistent_parent/items/item_000` without creating the parent log in the same batch.
9. **Counter Rollback & Deletion Attack**: Updating `/invoiceCounters/counter_SRA_2026_11` to lower `lastSequence` from `5` to `1` or calling `delete` on a counter doc.
10. **Terminal State Bypass**: Attempting to update `paymentStatus`, `paidAtDate`, or `paymentNote` on an `InvoiceLog` after `status` is `'archived'`.
11. **Value Poisoning on Payment Date/Status or Product Specs**: Updating `paidAtDate` to `'not-a-date'`, `paymentStatus` to `'force_paid'`, `priceBasis` to `'per_ton'`, or `harga` to `-5000`.
12. **Financial Tampering During Payment Update**: Updating `grandTotal` or `netPayable` in the same update request as `paymentStatus` / `paidAtDate`.
