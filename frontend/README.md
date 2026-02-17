This is the Next.js frontend for **Wyoming AI Judge** — an AI-powered small claims court simulation.

## UI Design

The interface uses a **Wyoming state color palette** throughout:

| Color | Hex | Usage |
|-------|-----|-------|
| Navy Blue | `#002D62` | Header, primary buttons, active states, headings |
| Gold | `#F0B323` | Completed step indicators, logo badge, accent highlights, dark-mode primary buttons |
| Cream | `#FDFBF7` | Page background (warm off-white) |
| Red | `#CE1126` | Error states (from WY flag border) |

Custom colors are defined as CSS variables and Tailwind theme tokens in `src/app/globals.css` and are available as utility classes (e.g., `bg-wy-navy`, `text-wy-gold`, `border-wy-navy-50`).

## Case Templates

The app ships with **20 example case templates** across 10 dispute categories commonly seen in Wyoming small claims court:

- Security Deposit, Landlord-Tenant, Property Damage, Contract, Consumer
- Loan/Debt, Wages/Services, Neighbor, Pet/Animal, plus "Start from scratch"

Templates are searchable by keyword via a combobox (title, case type, tags, and narrative text are all indexed).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Simulation Mode Flag

The UI simulation supports a runtime mode flag:

- `NEXT_PUBLIC_SIMULATION_MODE=mock` (default): runs fully local mock scoring
- `NEXT_PUBLIC_SIMULATION_MODE=backend`: sends case + judgment requests to the FastAPI backend

Copy `frontend/.env.local.example` to `frontend/.env.local` and adjust values as needed.

Optional API client tuning:

- `NEXT_PUBLIC_API_TIMEOUT_MS=8000` request timeout in milliseconds
- `NEXT_PUBLIC_API_RETRIES=1` retries for idempotent requests (GET/HEAD/OPTIONS)

Example:

```bash
# PowerShell
$env:NEXT_PUBLIC_SIMULATION_MODE="backend"
npm run dev
```

If backend mode fails at runtime, the UI falls back to mock results and shows a warning.

## Session Management

When running in backend mode, sessions are managed via **httpOnly cookies** set by the backend. The frontend uses `credentials: "include"` on all `fetch` calls so the session cookie is sent automatically.

- **Cookie-based auth** is the primary mechanism. The backend sets a `session_id` cookie (httpOnly, SameSite=Strict) on session creation and admin login.
- A lightweight **in-memory session ID** is kept for display purposes and for passing the session as a query parameter on WebSocket connections.
- `localStorage` is **no longer used** for session storage.

> **Note for developers:** Because sessions rely on cookies, the frontend and backend must share the same origin (or be proxied through nginx) for cookies to be sent. The Docker Compose setup and nginx config handle this automatically.

## Tests

Run unit/component tests with:

```bash
npm test
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
