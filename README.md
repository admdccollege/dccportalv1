# DCC Portal

College Management System PWA for Damdei Christian College, covering Higher Secondary, Undergraduate and Postgraduate. Built with Next.js, TypeScript, Tailwind CSS and Supabase.

## Set up

1. Create a **new** Supabase project. Don't reuse one that serves another app.
2. Run the files in `supabase/migrations/` in order, using the SQL Editor or `supabase db push`.
3. Copy `.env.example` to `.env.local` and fill it in.
4. Run `npm install`, then create the first admin:
   ```bash
   set -a; source .env.local; set +a
   npm run create-admin -- you@example.com "Your Name"
   ```
5. Run `npm run dev`, sign in on the **Institutional** tab, and work through **Academic setup**.

Deploying to Vercel: add the same variables. `vercel.json` schedules the daily alert job, which authenticates with `CRON_SECRET`. Generate push keys with `npx web-push generate-vapid-keys`.

## Tests

- `npm run test:db` runs every migration and the RLS suite on a throwaway local PostgreSQL. Requires PostgreSQL 15+ with contrib.
- `npm run test:unit` runs the import validation tests.
- GitHub Actions runs these plus a type check and production build on every push.

## Rules to confirm with the college

These are defaults, and each one should be checked against your regulations:

| Rule | Default | Where to change it |
| --- | --- | --- |
| Attendance | P and L count as attended; E is left out of the total; minimum 75%, alerts after 5 sessions | `attendance_policies`, `attendance_summary` |
| UG/PG grades | O 90, A+ 80, A 70, B+ 60, B 50, C 45, P 40, F below 40 | `grade_scales` |
| HS divisions | First 60%, Second 45%, Third 30% | `app.hs_division` |
| SGPA and CGPA | Credit-weighted; absent or missing marks count as zero | `publish_term_result` |
| Library | 3 books, 14 days, ₹2 a day | `library_settings` |
| Late offline sync | Faculty can sync up to 7 days back; the 24-hour lock starts when it reaches the server | `app.attendance_session_guard` |

## Known limits

- No online payment gateway: staff record Cash, UPI and bank payments by hand.
- Library scanning works through USB/Bluetooth scanners that type into the field, not the phone camera.
- All sign-ins pass through the server, so Supabase's per-IP auth rate limit may need raising in the dashboard.
- iOS has no Background Sync. Queued attendance is sent when the app is next opened online.
- Icons and colours are placeholders until official DCC branding is supplied.
