# Cleasy Survey — Security Specification (Phase 0)

## 1. Data Invariants
1. **Owner-Bound Study Isolation**: Every `/studies/{studyId}` document must have `ownerId == request.auth.uid` and `request.auth.token.email_verified == true`.
2. **Master Gate**: No `question`, `quota`, `response`, or `audit` subcollection document can be read or written unless the parent `/studies/{studyId}` exists and belongs to `request.auth.uid`.
3. **Immutable Ownership & Timestamps**: `ownerId`, `studyId`, and `createdAt` (`== request.time` on creation) cannot be modified after creation. `updatedAt` must equal `request.time`.
4. **Strict Anonymous / PII Split**: Anonymous responses in `/responses/{responseId}` store only `respuestas` map + demographic strata; optional field contact notes live exclusively in `/audits/{auditId}` and are strictly owner-only.
5. **No Shadow Fields & Strict Key Allowlists**: Every document creation enforces `keys().hasAll(...) && keys().hasOnly(...)` and every update enforces `affectedKeys().hasOnly(...)`.

## 2. Dirty Dozen Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated read/write**: Read `/studies/s1` with `auth == null`.
2. **Unverified email write**: Create `/studies/s1` with `auth.token.email_verified == false`.
3. **Owner spoofing**: Create `/studies/s1` with `ownerId: "victim-uid"` while signed in as `"attacker-uid"`.
4. **Shadow field injection**: Create `/studies/s1` with extra field `isAdmin: true`.
5. **Cross-tenant subcollection read**: List `/studies/victim-study/audits` without `where('ownerId', '==', auth.uid)`.
6. **Orphaned subcollection write**: Create `/studies/nonexistent/questions/q1` without an existing parent study.
7. **ID poisoning**: Create `/studies/${'a'.repeat(500)}` with a 500-char ID or invalid characters (`$bad/id`).
8. **Timestamp forgery**: Create `/studies/s1` with client-backdated `createdAt`.
9. **Immutable owner tampering**: Update `/studies/s1` changing `ownerId` or `createdAt`.
10. **Unbounded array / invalid alternative type**: Create `questions/q1` with `alternativas` > 30 items or `alternativas: [123]`.
11. **Invalid enum / quota corruption**: Create `quotas/c1` with `meta: 0` or `actual: -5`, or `responses/r1` with invalid `estado_cuota`.
12. **Blanket list scraping**: Query `/studies` without `where('ownerId', '==', request.auth.uid)`.
