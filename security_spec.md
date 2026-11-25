# Security Specification & Red-Team Audit Spec (Shared Team Workspace)

## 1. Data Invariants
1. **Shared Workspace Scope**: By explicit business requirement (no Google login so all internal admins share one unified dataset), every document in `invoiceLogs`, `invoiceLogs/{logId}/items`, and `bankAccounts` must bind `ownerId` strictly to `'shared_team'` on creation and never allow `ownerId` or `createdAt` to mutate on update.
2. **Master Gate & Atomicity**: An `InvoiceLogItem` under `/invoiceLogs/{logId}/items/{itemId}` cannot exist without its parent `/invoiceLogs/{logId}` existing in the same batch (`existsAfter` + `getAfter` workspace owner match) and matching `incoming().logId == logId`.
3. **No Unbounded Arrays**: Line items are stored in `/invoiceLogs/{logId}/items/{itemId}` rather than an unbounded array on the parent document.
4. **Terminal State Locking**: Once an `InvoiceLog` has `status == 'archived'`, no further updates are permitted.
5. **Strict Timestamps & Bounds**: `createdAt` and `updatedAt` must equal `request.time` during creation/updates, all string fields enforce explicit `.size()` bounds, numbers enforce non-negative bounds, and document IDs match `^[a-zA-Z0-9_\\-]+$`.
6. **Default-Deny Safety Net**: All collections outside `invoiceLogs`, `invoiceLogs/{logId}/items`, and `bankAccounts` are denied by default (`match /{document=**}`).

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unscoped Collection Access**: Reading or writing `/unknownCollection/doc1` or legacy `/userSettings/any`.
2. **Workspace Owner Spoofing**: Creating `/invoiceLogs/log_1` with `ownerId: 'other_tenant'` instead of `'shared_team'`.
3. **Shadow Field Injection**: Creating `/invoiceLogs/log_2` with an extra undeclared field `isVerified: true` or `adminOverride: true`.
4. **Client Timestamp Forgery**: Creating `/invoiceLogs/log_3` with `createdAt` set to a past client date instead of `request.time`.
5. **ID Poisoning**: Creating `/invoiceLogs/invalid$id..slash` or a 300-char document ID.
6. **Resource Exhaustion (1MB String)**: Creating `/invoiceLogs/log_4` with a 50,000-char `buyerName` or 500,000-char `logoDataUrl`.
7. **Unfiltered List Query**: Calling `list` on `/invoiceLogs` without filtering `ownerId == 'shared_team'`.
8. **Orphaned Subcollection Write**: Creating `/invoiceLogs/nonexistent_parent/items/item_000` without creating the parent log in the same batch.
9. **Owner / Timestamp Hijack on Update**: Updating `/invoiceLogs/log_1` to change `ownerId`, `createdAt`, or `grandTotal`.
10. **Terminal State Bypass**: Attempting to update an `InvoiceLog` after `status` is `'archived'`.
11. **Value Poisoning on Whitelisted Update Field**: Updating `actionType` to an invalid string `'hacked'` or `status` to a boolean.
12. **Invalid Enum / Regex Poisoning**: Writing `ppnMode: 'bypass'`, `tableHeaderColor: 'not-a-hex'`, or negative `grandTotal: -5000`.
