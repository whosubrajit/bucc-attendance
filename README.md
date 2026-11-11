<div align="center">

# 🎫 BUCC Attendance Management System

**The official, battle-tested real-time attendance & event operations platform for the BRAC University Computer Club (BUCC).**

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.19-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1?style=for-the-badge&logo=postgresql)](https://supabase.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Realtime-FFCA28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)

[Features](#-key-features) • [Architecture](#-architecture--tech-stack) • [Role Matrix](#-role-based-access-control-rbac) • [Getting Started](#-getting-started) • [Deployment](#-deployment--security)

</div>

---

## ⚡ Battle-Tested at Scale

Built to replace chaotic paper rosters and spoofable Google Forms, BUCC Attendance runs in production powering every general meeting, workshop, and club event:

<div align="center">

| 🚀 **110+** | 👥 **1,000+** | ⏱️ **< 3s** | 🛡️ **0%** |
| :---: | :---: | :---: | :---: |
| **Peak Concurrent Users**<br>*(Rush-hour check-ins)* | **Monthly Active Visitors**<br>*(Campus-wide adoption)* | **Average Check-In Speed**<br>*(Scan to verified)* | **Proxy Attendance Rate**<br>*(HMAC rolling tokens)* |

</div>

---

## ✨ Key Features

### 🛡️ 1. Anti-Proxy Dynamic QR Engine
- **Rotating HMAC Tokens**: QR codes cycle cryptographic tokens every few seconds. Screenshots shared via messaging apps expire before another member can scan them.
- **Strict Location & Domain Locking**: Restricted to authenticated BRACU institutional accounts (`@g.bracu.ac.bd`) with device fingerprint and IP audit logs.

### 🪪 2. Interactive Digital ID Card & Boarding Passes
- **3D Physics Hanging Badge**: Dynamic personal ID card with department badges, designation, and smooth Framer Motion interactions.
- **Pre-Event RSVPs & Boarding Passes**: Members generate personalized passes for club events with status tracking and capacity management.

### 📡 3. Live Attendance Board
- **Real-Time Presence**: Instant check-in tally powered by Firebase Realtime DB.
- **Departmental Breakdown**: Filter live headcount across Executive Body (EB), Senior Executives (SE), and general Members.

### 🔄 4. Multi-Stage Sign-Out & Escalation Pipeline
- **Sign-Out Approval Queue**: Prevents early departures without verification.
- **Automated Escalation**: Sign-out requests unreviewed after 30 minutes escalate to Governing Body (GB) and HR executives.
- **Safety Auto-Approval Fallback**: 2-hour timeout safety release tagged with `needsReview` for retroactive audit.

### 🏛️ 5. Granular Role-Based Access Control (RBAC)
- Multi-tier authority levels: `MEMBER`, `SE`, `CREATIVE_SE`, `HR_SE`, `EB`, `HR_EB`, and `GB`.
- **Temporary Role Delegation**: Grant time-bound elevated scanning privileges to event leads without changing permanent roles.
- **Central DB Sync**: Bi-directional syncing with BUCC's Central Member Directory to enforce club roster integrity.

### 📊 6. Analytics & Administrative Tools
- **Department Metrics & Recharts**: Visual charts showing attendance trends across departments.
- **Export System**: Instant CSV generation for official club documentation and administrative records.
- **Audit Logging**: Immutable audit trail for all approvals, rejections, manual overrides, and member status changes.

---

## 🏗️ Architecture & Tech Stack

```mermaid
flowchart TD
    Client["Client Browser\n(Next.js 16 + React 18)"]
    Auth["NextAuth.js\n(@g.bracu.ac.bd Google OAuth)"]
    API["API Route Guards & Server Actions\n(Zod + RBAC Validation)"]
    DB[("PostgreSQL\n(Prisma ORM)")]
    Realtime[("Firebase Realtime DB\n(Live Board Feeds)")]
    HMAC["HMAC-SHA256 Token Engine\n(Rolling QR Secrets)"]

    Client -->|Google Sign-In| Auth
    Client -->|Scan Dynamic QR| API
    API -->|Verify Cryptographic Nonce| HMAC
    API -->|Write Attendance & Audit Log| DB
    API -->|Broadcast Room Count| Realtime
    Realtime -->|Live Count Sync| Client
```

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router), React 18 |
| **Styling & Motion** | [Tailwind CSS](https://tailwindcss.com/), [Framer Motion](https://www.framer.com/motion/), [Canvas Confetti](https://github.com/catdad/canvas-confetti) |
| **Authentication** | [NextAuth.js](https://next-auth.js.org/) (Google Provider with BRACU domain lock) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) (hosted on Supabase) with [Prisma](https://www.prisma.io/) |
| **Realtime Sync** | [Firebase Realtime Database](https://firebase.google.com/products/realtime-database) |
| **QR Generation / Scan**| `qrcode.react` + `html5-qrcode` + HMAC-SHA256 token signing |
| **Analytics & UI** | [Recharts](https://recharts.org/), [Lucide React](https://lucide.dev/) |

---

## 🔐 Role-Based Access Control (RBAC)

Every administrative action is guarded server-side against fresh database lookups:

| Role | Scan Members | Live Board | Approve Sign-Outs | Export CSV | Manage Members | Post Announcements |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **MEMBER** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **SE** (Senior Executive) | ❌ | Department | ❌ | ✅ | ❌ | ❌ |
| **EB** (Executive Body) | ✅ | All | ✅ | ✅ | ❌ | ✅ |
| **HR_SE** (HR Senior Exec) | ✅ | All | ✅ | ✅ | ❌ | ❌ |
| **HR_EB** (HR Director/AD) | ✅ | All | ✅ | ✅ | ✅ | ✅ |
| **GB** (Governing Body) | ✅ | All | ✅ | ✅ | ✅ | ✅ |

*Note: Session creators and temporary role assignees receive scoped event permissions.*

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** >= 18.17.0
- **PostgreSQL** database (or Supabase instance)
- **Google Cloud Console** OAuth 2.0 Client credentials

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/bucc-attendance.git
   cd bucc-attendance
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env.local
   ```
   Fill in the mandatory keys:
   ```env
   # Database (Supabase pooler + direct URL)
   DATABASE_URL="postgresql://user:password@host:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://user:password@host:5432/postgres"

   # Auth
   NEXTAUTH_URL="http://localhost:3000"
   NEXTAUTH_SECRET="your-32-character-secret"
   GOOGLE_CLIENT_ID="your-google-client-id"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   ALLOWED_EMAIL_DOMAIN="g.bracu.ac.bd"

   # Security & QR Tokens
   QR_SIGNING_SECRET="your-hex-hmac-secret"
   CRON_SECRET="your-cron-bearer-token"
   ```

4. **Initialize Database & Seed Data:**
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

5. **Start Development Server:**
   ```bash
   npm run dev
   ```
   Visit [http://localhost:3000](http://localhost:3000) to open the app.

---

## 🛠️ Operational Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts local Next.js dev server with hot reload |
| `npm run build` | Generates Prisma client & runs production build |
| `npm run db:migrate` | Runs new Prisma migrations |
| `npm run db:seed` | Seeds central member database & default test accounts |
| `npm run db:studio` | Opens Prisma Studio GUI to inspect records |

### External escalation scheduler

The stale-attendance escalation endpoint is protected by `CRON_SECRET` and is
scheduled through GitHub Actions rather than Vercel Cron. In the repository's
**Settings → Secrets and variables → Actions**, add:

- `ESCALATION_URL`: the deployed application's origin, such as
  `https://attendance.example.com` (without a trailing slash)
- `CRON_SECRET`: the same value configured in the deployment environment

The workflow runs every five minutes and can also be started manually from the
Actions tab. GitHub Actions schedules can be delayed during periods of load,
so the endpoint remains idempotent and safely processes any stale requests on
the next run.

---

## 🔒 Security & Reliability

- **Domain Restriction**: Enforces `@g.bracu.ac.bd` domain matching at the NextAuth callback and database layer.
- **Connection Pooling**: Uses Supabase Transaction Pooler (PgBouncer on port `6543`) to safely withstand concurrency spikes of 100+ simultaneous check-in attempts.
- **Rate Limiting**: Built-in sliding window rate limiter protects QR verification and sign-in endpoints against brute-force or spamming.
- **Audit Integrity**: Critical operations generate immutable `AuditLog` rows linking the actor ID, action type, and affected target.

---

## 💡 The Story

> *"bhai crazy code korsi, mane vibe code arki"*  
> — *Initial commit philosophy*

What started as an ambitious, late-night vibe-coding sprint to eliminate long queues and proxy check-ins at club events quickly grew into an indispensable, campus-proven platform handling high-volume traffic for hundreds of members across BRAC University.

---

## 👥 Authors & Acknowledgments

- **Developed for:** [BRAC University Computer Club (BUCC)](https://bracucc.org)
- **Built & Maintained by:** Dibyo Singho Barua Subrajit
