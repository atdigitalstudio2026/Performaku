# Security Specification & Red-Team Audit Spec (Shared Team Workspace + Sales Tracking + Auto-Numbering)

## 1. Data Invariants
1. **Shared Workspace Scope**: Every document in `invoiceLogs`, `invoiceLogs/{logId}/items`, `bankAccounts`, and `invoiceCounters` must bind `ownerId` strictly to `'shared_team'` on creation and never allow `ownerId` or `createdAt` to mutate on update.
2. **Master Gate & Atomicity**: An `InvoiceLogItem` under `/invoiceLogs/{logId}/items/{itemId}` cannot exist without its parent `/invoiceLogs/{logId}` existing in the same batch (`existsAfter` + `getAfter` workspace owner match) and matching `incoming().logId == logId`.
3. **Sales & Payment Status Integrity**: Every new `InvoiceLog` must declare `salesName` (string, `<= 120` chars) and `paymentStatus` strictly within `['pending', 'paid', 'cancelled']`. Updates to `paymentStatus` or `salesName` are isolated into strict `affectedKeys().hasOnly(...)` action branches guarded by `isValidInvoiceLog(incoming())`.
4. **Monotonic Per-PT Invoice Counter Integrity**: Every document in `/invoiceCounters/{counterId}` must declare valid `companyCode` (`^[A-Z0-9]{1,16}$`), `periodKey` (`^\d{4}-\d{2}$`), and non-negative integer `lastSequence` (`0..999999`). On update, `companyCode`, `periodKey`, `ownerId`, and `createdAt` are immutable, `lastSequence` can never decrease (`incoming().lastSequence >= existing().lastSequence`), and deletions are forbidden (`allow delete: if false`).
5. **No Unbounded Arrays**: Line items are stored in `/invoiceLogs/{logId}/items/{itemId}` rather than an unbounded array on the parent document.
6. **Terminal State Locking**: Once an `InvoiceLog` has `status == 'archived'`, no further updates are permitted.
7. **Strict Timestamps & Bounds**: `createdAt` and `updatedAt` must equal `request.time` during creation/updates, all string fields enforce explicit `.size()` bounds, numbers enforce non-negative bounds, and document IDs match `^[a-zA-Z0-9_\\-]+$`.
8. **Default-Deny Safety Net**: All collections outside `invoiceLogs`, `invoiceLogs/{logId}/items`, `bankAccounts`, and `invoiceCounters` are denied by default (`match /{document=**}`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unscoped Collection Access**: Reading or writing `/unknownCollection/doc1` or legacy `/userSettings/any`.
2. **Workspace Owner Spoofing**: Creating `/invoiceLogs/log_1` or `/invoiceCounters/counter_SRA_2026_11` with `ownerId: 'other_tenant'` instead of `'shared_team'`.
3. **Shadow Field Injection**: Creating `/invoiceLogs/log_2` or `/invoiceCounters/counter_SRA_2026_11` with an extra undeclared field `isVerified: true` or `bypassSeq: true`.
4. **Client Timestamp Forgery**: Creating `/invoiceLogs/log_3` or `/invoiceCounters/counter_SRA_2026_11` with `createdAt` set to a past client date instead of `request.time`.
5. **ID Poisoning**: Creating `/invoiceLogs/invalid$id..slash` or `/invoiceCounters/bad/id` or a 300-char document ID.
6. **Resource Exhaustion (1MB String)**: Creating `/invoiceLogs/log_4` with a 50,000-char `salesName` or 500,000-char `logoDataUrl`.
7. **Unfiltered List Query**: Calling `list` on `/invoiceLogs` or `/invoiceCounters` without filtering `ownerId == 'shared_team'`.
8. **Orphaned Subcollection Write**: Creating `/invoiceLogs/nonexistent_parent/items/item_000` without creating the parent log in the same batch.
9. **Counter Rollback & Deletion Attack**: Updating `/invoiceCounters/counter_SRA_2026_11` to lower `lastSequence` from `5` to `1`, mutating `companyCode`/`periodKey`, or calling `delete` on a counter doc.
10. **Terminal State Bypass**: Attempting to change `paymentStatus` on an `InvoiceLog` after `status` is `'archived'`.
11. **Value Poisoning on Payment Status / Sequence**: Updating `paymentStatus` to `'force_paid'` or setting `lastSequence` to a string `'999'` or negative `-1`.
12. **Invalid Enum / Regex Poisoning**: Writing `ppnMode: 'bypass'`, `tableHeaderColor: 'not-a-hex'`, `companyCode: 'bad-code!'`, or `periodKey: '2026/11'`.
