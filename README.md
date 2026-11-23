README · MD


# CaterHub

A caterer directory for Calbayog City. Customers browse caterers, compare packages and send inquiries. Caterer owners manage their business profile, packages, availability calendar and inquiries. Customers and owners chat inside each inquiry.

**Built with:** React 18, Vite, React Router and Supabase (Auth, Postgres, Storage).

## Features

**Customers**
- Browse and search published caterers, save favorites and compare them
- View caterer profiles, packages, menus and photo galleries
- Send an inquiry for a package or a custom event
- Track inquiries, chat with the caterer and get in-app notifications

**Caterer owners**
- Business profile with logo, event types and service areas (Draft, Published or Deactivated)
- Packages with menu items and photos
- Availability calendar with private notes
- Inquiry inbox: reply, update the status and chat with the customer

## Getting started

1. Install dependencies:
```bash
   npm install
```
2. Create a [Supabase](https://supabase.com) project, open **SQL Editor** and run these files **in this order**:
   1. `supabase/caterhub_schema.sql`
   2. `supabase/caterhub_safe_update.sql`
   3. `supabase/caterhub_owner_chat_patch.sql`
   4. `supabase/caterhub_security_patch.sql` (always run this one last)

   The other `.sql` files in the `supabase` folder are older patches that `supabase/caterhub_safe_update.sql` already includes. Do not re-run them: `supabase/set_inquiry_status.sql` contains an old insecure version of a function.
3. Copy `.env.example` to `.env` and fill in your project values (Supabase → Project Settings → API):
```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```
   Use the **anon** key only. Never put the `service_role` key in this app, and never commit `.env`.
4. In Supabase go to **Authentication → Providers → Email**. Turn off "Confirm email" while testing and turn it back on in production.
5. Start the app:
```bash
   npm run dev
```
   Open http://localhost:5173.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Build for production into `dist/` |
| `npm run preview` | Preview the production build |

## Project structure

```
src/
├── auth/        Login and signup
├── customer/    Send inquiry, my inquiries, inquiry detail, notifications
├── owner/       Dashboard, business profile, packages, availability, inquiries
├── public/      Home, caterer directory, profiles, compare, saved
├── shared/      Auth context, Supabase client, header, chat, shared helpers
├── App.jsx      Routes
├── main.jsx     Entry point
└── styles.css   All styles
```

## Testing

`TEST_CASES.csv` maps every SFFRS/NFR requirement ID to a test case.

## Deploying to Vercel

1. Import the repo into Vercel (it detects Vite).
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under **Settings → Environment Variables**.
3. Add a `vercel.json` in the project root so page refreshes work with client-side routing:
```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
```
4. In Supabase → Authentication → URL Configuration, set the **Site URL** to your Vercel domain.

## Security notes

- Access control lives in the database (Row Level Security and SQL functions), so every change to the `.sql` files needs a careful review.
- Keep `.env` out of git. It is already listed in `.gitignore`.
- Photos are uploaded to a public `photos` storage bucket (JPG, PNG or WebP, 2 MB max).
