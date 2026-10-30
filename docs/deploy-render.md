# Deploy DeskSpot API on Render (+ Neon DB + Vercel UI)

Copy-paste guide. Frontend stays on Vercel; only the API runs on Render.

## Generated secrets (use these)

```
JWT_SECRET=BDpQWHzhMvQp_R4_CUmOk8STOCQ3T3pJOrhj5IMX05txbSXg_XluYmT8VQs6kRsQ
ADMIN_INVITE_CODE=DeskSpot-3782AA563B39
```

Store them in a password manager. Do **not** commit them to git.

---

## A. Neon (database) — ~3 minutes

1. Open https://console.neon.tech → sign in with GitHub.
2. **New Project**
   - Name: `deskspot`
   - Postgres: **16**
   - Region: closest to you (e.g. Frankfurt / Europe)
3. **Create project**.
4. On the project home, **Connection details** → copy the connection string that looks like:

```
postgresql://neondb_owner:xxxx@ep-xxxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

5. Keep that tab open. If migrate later fails on `btree_gist`, open **SQL Editor** and run:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

---

## B. Render (API) — click by click

1. Open https://dashboard.render.com → sign in with GitHub.
2. Top right: **+ New** → **Web Service**.
3. **Connect a repository** → select your DeskSpot GitHub repo → **Connect**.
   - If the repo is missing: **Configure account** / grant access, then refresh.
4. Fill the form:

| Field | Value |
| --- | --- |
| **Name** | `deskspot-api` |
| **Language** | `Node` |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Build Command** | `npm ci && npx prisma generate` |
| **Start Command** | `npx prisma migrate deploy && node prisma/seed.js && node src/server.js` |
| **Instance type** | **Free** |

5. Open **Advanced** (or Environment Variables section on the same form):
   - **Health Check Path:** `/api/health`
6. Add these **Environment Variables** (exact keys; paste values):

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `JWT_SECRET` | `BDpQWHzhMvQp_R4_CUmOk8STOCQ3T3pJOrhj5IMX05txbSXg_XluYmT8VQs6kRsQ` |
| `JWT_EXPIRES_IN` | `8h` |
| `ADMIN_INVITE_CODE` | `DeskSpot-3782AA563B39` |
| `DATABASE_URL` | *(Neon string from step A4 — paste as one line)* |
| `FRONTEND_ORIGIN` | `https://deskspot-deploy.vercel.app` |

7. Do **not** add `EXPOSE_RESET_TOKEN`.
8. Click **Create Web Service** (or **Deploy Web Service**).
9. Wait until the deploy log shows `DeskSpot API listening`.
10. Copy the service URL from the top of the service page, e.g.:

```
https://deskspot-api.onrender.com
```

11. Open this in a browser (first free-tier wake can take ~50s):

```
https://deskspot-api.onrender.com/api/health
```

Expected: `{"status":"ok",...}`

If health works but you later change the Vercel domain, update `FRONTEND_ORIGIN` to match exactly (no trailing slash) → **Save and deploy**.

---

## C. Vercel (frontend) — required so signup works

1. Open https://vercel.com → your **deskspot-deploy** project.
2. **Settings** → **Environment Variables**.
3. **Add** (Production):

| Key | Value |
| --- | --- |
| `VITE_API_URL` | `https://deskspot-api.onrender.com` |

Use **your** Render URL from B10. No trailing slash.

4. **Delete** from Vercel if present: `JWT_SECRET`, `DATABASE_URL`, `FRONTEND_ORIGIN` (those are Render-only).
5. **Deployments** → latest → **⋯** → **Redeploy** (enable **Use existing Build Cache** = off / clear cache if available).
6. Open https://deskspot-deploy.vercel.app → Employee → Register or sign in.

### Seed / demo logins (after seed runs on Render start)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@deskspot.test` | `Admin123!` |
| Employee | `employee@deskspot.test` | `Employee123!` |

New admin accounts need invite code: `DeskSpot-3782AA563B39`.

---

## D. Quick checks

```
https://YOUR-API.onrender.com/api/health
https://YOUR-API.onrender.com/api/docs
https://deskspot-deploy.vercel.app/
```

Login as employee → Find a space → book. If login fails after env changes: wait for Render restart, then hard-refresh Vercel (Ctrl+F5).

---

## Free-tier notes

- Render Free sleeps after ~15 min idle; first request can take ~50s.
- Auto-deploys on push to `main` when the GitHub repo is connected.
- Local Docker Compose is optional; production path is Neon + Render + Vercel.
