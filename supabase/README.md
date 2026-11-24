# CaterHub database (Supabase)

Open **Supabase → SQL Editor**, paste a file, press **Run**. Run them in this order.

| # | File | For | What it does |
|---|------|-----|--------------|
| 1 | `setup/1_schema.sql` | everyone | Tables, roles, sign-up trigger, base security rules |
| 2 | `setup/2_safe_update.sql` | everyone | Storage, notifications, replies, calendar, address and other earlier updates |
| 3 | `owner/01_cover_image.sql` | owner | Cover photo on the caterer card |
| 4 | `owner/02_chat_with_customer.sql` | owner | Caterer can message the customer on an inquiry |
| 5 | `owner/03_package_pricing.sql` | owner | Fixed price packages (like a family combo) |
| 6 | `owner/04_package_type.sql` | owner | Food package vs Catering package |
| 7 | `owner/05_photo_events.sql` | owner | Event and caption on package photos (gallery filter) |
| 8 | `owner/06_verification.sql` | owner | Private business verification + verified badge |
| 9 | `customer/reviews.sql` | customer | Star reviews with photos |
| 10 | `security/security_patch.sql` | everyone | Security fixes. **Always run last** |

Every file can be run again safely, except the ones in `legacy/`.

## Folders

- `setup/`: the base database. Shared by all roles.
- `owner/`: features for caterer accounts.
- `customer/`: features for customer accounts.
- `public/`: what visitors who are not logged in can see. `availability_visibility.sql` is already part of step 2. Run it again only if visitors cannot see Reserved dates.
- `security/`: protections that apply to every role.
- `legacy/`: old patches already covered by the files above. **Do not run.** `set_inquiry_status_INSECURE.sql` is an old, insecure version of a function.

## Who can see what

| Data | Visitor (not logged in) | Customer | Owner |
|------|:--:|:--:|:--:|
| Published caterer profiles, packages, menus, photos | read | read | own only, edit |
| Reserved / Unavailable dates | read | read | edit |
| Private calendar notes | no | no | own only |
| Reviews of Published caterers | read | read, write (after an inquiry) | read |
| Verified badge | read | read | read (cannot set it) |
| Verification details and permit file | **no** | **no** | own only |
| Inquiries, messages, notifications | no | own only | their caterer's only |

## Verifying a business

The owner fills in **Business verification** in their Business profile (it shows "Pending review"). After you check the details and permit, run this in the SQL editor (replace `1` with the caterer_id):

```sql
update caterer_profiles set is_verified = true where caterer_id = 1;
```

The badge then appears next to the caterer's name. If the owner edits the details later, the badge goes back to pending.
