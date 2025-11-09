# Kendal Contact Importer

Smart contact field mapping tool for Kendal. Upload CSV/Excel files, auto-map headers to custom fields, preview merges, and push contacts into Firestore.

- Live Demo: [Deployment on Vercel](https://kendal-contact-importer.vercel.app/)

## Overview
- Built on Next.js 16 with the App Router, React 19, and Tailwind CSS 4 for the UI layer.
- Server-side routes (`app/api/*`) wrap Firebase Admin so the client never touches service credentials.
- `ImportContactsModal` handles file upload, parsing, confidence-scored field mapping, merge review, and progress reporting inside a single guided flow.
- CSV ingest is powered by PapaParse; custom mapping helpers detect agent-owner columns, prioritize core fields, and keep a changelog of user overrides.
- Toasts, progress badges, and optimistic UI state keep the flow responsive while background batches sync to Firestore.

## Final Plan With Annotations
| Workstream | Status | Notes |
| --- | --- | --- |
| Assumptions | Done | CSV/XLSX with header row enforced; Firestore free-tier limits informed batch caps and progress UX. |
| Field Mapping Strategy | Done | Implemented synonym + fuzzy matching, auto-surface agent email columns, allow full manual overrides before commit. |
| Merge Logic | Done | API queries contacts by email/phone, merges non-empty values, preserves `createdOn` timestamps. |
| Batching | Done | Modal tracks per-batch progress, chunk size configurable (default 250). |
| Initial Setup | Done | Next.js scaffold, Tailwind, Firebase Admin wiring, seeded mock Firestore data. |
| Core Development | Done | File ingestion modal, mapping UI, field editor, contact list, and server routes. |
| Other Notes | Done | Animations and CSV fixtures shipped; Used PapaParse's built-in worker functionality so the render is not blocked. Additional funcitonality such as dynamic views of custom contact fields on contact page has been implemented that allows users to choose up to 3 custom fields to show on the UI, I believed it could be an useful feature |

## Running Locally
1. **Requirements**: Node.js 20+, pnpm 9+, Firebase project with Firestore enabled.
2. **Install deps**
   ```bash
   pnpm install
   ```
3. **Environment**
   ```bash
   cp .env.example .env
   # Fill in Firebase admin credentials and NEXT_PUBLIC_FIREBASE_* values
   ```
4. **Development server**
   ```bash
   pnpm dev
   ```
   App boots at `http://localhost:3000`.
5. **Build for production**
   ```bash
   pnpm build && pnpm start
   ```
6. **Lint**
   ```bash
   pnpm lint
   ```

## Implementation Notes
- **API Routes**: `app/api/contacts/route.ts` exposes a Firestore-backed GET endpoint, enforces `companyId`, sorts results by `createdOn`, and never ships admin credentials to the client. `app/api/custom-fields/[id]/route.ts` supports PATCH/POST/DELETE with upserts and defensive ID resolution when params are missing.
- **Firebase Admin**: `lib/firebase-admin.ts` lazily initializes the singleton with service-account data from env vars to avoid re-instantiation during hot reloads.
- **Import Modal**: `components/import-contacts-modal.tsx` orchestrates drag-and-drop upload, PapaParse streaming with progress events, agent column detection, fuzzy mapping suggestions, manual overrides, and final batch execution with summary cards.
- **Mapping Utilities**: `lib/mapping/*` normalizes CSV headers, ranks candidate matches by synonym dictionaries and fuzzysort scores, and keeps column metadata (`showAsColumn`, `core`) for UI hints.
- **UI/UX Details**: Uses shadcn-inspired primitives plus Lucide icons, animated progress pulses, inline error callouts, was tested on 1920x1080p screen but should be usable on most desktop/laptop devices. No mobile view support.

## Trade-offs & Limitations
- No background job queue; long-running imports rely on the browser tab remaining open. A future enhancement could push batches through a Firestore-triggered worker.
- Auth is mocked via environment company IDs; multi-tenant auth or role-based checks were out of scope.
- Error handling concentrates on per-row validation with toast summaries; there is no retry queue for failed records beyond re-importing the file.
