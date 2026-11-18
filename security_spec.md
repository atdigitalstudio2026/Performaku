# Security Specification & Red-Team Audit Spec

## 1. Data Invariants
1. **Identity Integrity**: Every document in `invoiceLogs`, `invoiceLogs/{logId}/items`, `bankAccounts`, and `userSettings` must bind `ownerId` strictly to `request.auth.uid` on creation and never allow `ownerId` or `createdAt` to mutate on update.
2. **Email Verification Mandate**: All authenticated read/write operations require `request.auth.token.email_verified == true`.
3. **Master Gate & Atomicity**: An `InvoiceLogItem` under `/invoiceLogs/{logId}/items/{itemId}` cannot exist without its parent `/invoiceLogs/{logId}` existing in the same batch (`existsAfter` + `getAfter` owner match) and matching `incoming().logId == logId`.
4. **No Unbounded Arrays**: Line items are stored in `/invoiceLogs/{logId}/items/{itemId}` rather than an unbounded array on the parent document.
5. **PII & Commercial Data Isolation**: Invoice logs (containing buyer names, buyer addresses, seller email/phone, and bank numbers) are readable only by the document `ownerId` or the verified bootstrapped admin (`acu.andi80@gmail.com`). Blanket `allow read: if isSignedIn()` is strictly forbidden.
6. **Terminal State Locking**: Once an `InvoiceLog` has `status == 'archived'`, non-admin users cannot update it.
7. **Strict Timestamps & Bounds**: `createdAt` and `updatedAt` must equal `request.time` during creation/updates, all string fields enforce explicit `.size()` bounds, and document IDs match `^[a-zA-Z0-9_\\-]+$`.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Reading `/invoiceLogs` or writing `/invoiceLogs/log_1` with `auth == null`.
2. **Unverified Email Spoofing**: Token with `email: 'acu.andi80@gmail.com'` and `email_verified: false`.
3. **Identity Spoofing on Create**: Creating `/invoiceLogs/log_2` with `ownerId: 'victim_uid'` while signed in as `attacker_uid`.
4. **Shadow Field Injection**: Creating `/invoiceLogs/log_3` with an extra undeclared field `isVerified: true` or `adminOverride: true`.
5. **Client Timestamp Forgery**: Creating `/invoiceLogs/log_4` with `createdAt` set to a past client date instead of `request.time`.
6. **ID Poisoning**: Creating `/invoiceLogs/invalid$id..slash` or a 300-char document ID.
7. **Resource Exhaustion (1MB String)**: Creating `/invoiceLogs/log_5` with a 50,000-char `buyerName` or 500,000-char `logoDataUrl`.
8. **Cross-Tenant List Scraping**: Calling `list` on `/invoiceLogs` as `user_B` without filtering `ownerId == user_B.uid` (or attempting to read `user_A`'s document via `get`).
9. **Orphaned Subcollection Write**: Creating `/invoiceLogs/nonexistent_parent/items/item_1` without creating the parent log in the same batch.
10. **Owner Hijack on Update**: Updating `/invoiceLogs/log_1` to change `ownerId` or `createdAt`.
11. **Terminal State Bypass**: Non-admin attempting to update an `InvoiceLog` after `status` is `'archived'`.
12. **Invalid Enum / Regex Poisoning**: Writing `ppnMode: 'bypass'`, `tableHeaderColor: 'not-a-hex'`, or negative `grandTotal: -5000`.
