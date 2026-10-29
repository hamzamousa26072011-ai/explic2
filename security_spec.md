# Security Specification — Engez Nafsak Firestore Architecture

## 1. Data Invariants
1. **PII Isolation**: `/profiles/{userId}` contains ONLY public student gamification and 5-digit friend code metadata (no email, phone, or private credentials).
2. **Strict Workspace Ownership**: `/workspaces/{userId}` can ONLY be read, created, or updated by `request.auth.uid == userId` with a verified email (`request.auth.token.email_verified == true`), and `ownerId` must equal `request.auth.uid`.
3. **Friend Request Integrity**: A `FriendRequest` can only be created when `fromUid == request.auth.uid` and `status == 'pending'`. Once `status` reaches `'accepted'` or `'declined'` (terminal state), no further updates are permitted.
4. **Study Room Integrity**: A `StudyRoom` requires `ownerId == request.auth.uid`, valid 5-digit `roomCode`, and bounded string lengths.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing on Profile**: Authenticated user `userA` attempts to write `/profiles/userB` with `uid: "userB"`. -> `PERMISSION_DENIED`
2. **Shadow Field Injection on Profile**: `userA` writes `/profiles/userA` including an undeclared field `isAdmin: true`. -> `PERMISSION_DENIED`
3. **Unverified Email Write**: User with `email_verified: false` attempts to create `/workspaces/userA`. -> `PERMISSION_DENIED`
4. **Cross-User Workspace Read**: `userA` attempts `get` on `/workspaces/userB`. -> `PERMISSION_DENIED`
5. **Denial-of-Wallet Oversized String**: `userA` sends a 600KB `displayName` to `/profiles/userA`. -> `PERMISSION_DENIED`
6. **Invalid Friend Code Pattern**: `userA` creates profile with `friendCode: "ABC12"` (non-numeric). -> `PERMISSION_DENIED`
7. **Forged Sender on Friend Request**: `userA` creates `/friendRequests/req1` with `fromUid: "userB"`. -> `PERMISSION_DENIED`
8. **State Shortcutting on Friend Request**: `userA` creates `/friendRequests/req1` directly with `status: "accepted"`. -> `PERMISSION_DENIED`
9. **Terminal State Mutation**: `userB` attempts to update `/friendRequests/req1` after `status` is already `"accepted"`. -> `PERMISSION_DENIED`
10. **Immutable Field Mutation**: `userB` accepts `/friendRequests/req1` while simultaneously mutating `fromUid`. -> `PERMISSION_DENIED`
11. **Timestamp Forgery**: `userA` creates `/studyRooms/room1` with a past or future `createdAt` not matching `request.time`. -> `PERMISSION_DENIED`
12. **Poisoned Document ID**: `userA` creates `/studyRooms/invalid$id!@#` with invalid characters. -> `PERMISSION_DENIED`
