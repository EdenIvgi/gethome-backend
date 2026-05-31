# Production Deployment Plan — Free Tier (No-CC)

תוכנית עבודה להעלאת gethome לפרודקשן ללא עלות, מבוססת על מסלול B שאושר.
המסמך הזה עוקב אחרי ההתקדמות — Claude מסמן ✅ אחרי כל משימה שמושלמת.

---

## ארכיטקטורה

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Vercel     │ ───► │   Render     │ ───► │    Turso     │
│  (frontend)  │      │  (API only)  │      │ (libSQL DB)  │
└──────────────┘      └──────────────┘      └─────▲────────┘
                                                  │ write
                                            ┌─────┴────────┐
                                            │ GitHub       │
                                            │ Actions      │
                                            │ (scrapers,   │
                                            │  hourly cron)│
                                            └──────┬───────┘
                                                   │ notify
                                            ┌──────▼───────┐
                                            │ Telegram Bot │
                                            └──────────────┘
```

## רכיבים והמגבלות החינמיות

| רכיב | שירות | חינמי לתמיד? | מגבלה |
|------|--------|--------------|---------|
| Frontend | Vercel Hobby | ✅ | 100GB bandwidth/חודש |
| Backend API | Render Free | ✅ | 512MB RAM, 0.1 CPU, נרדם אחרי 15min idle |
| DB | Turso | ✅ | 9GB storage, 1B reads, 25M writes / חודש |
| Scrapers | GitHub Actions | ✅ | 2,000 min/חודש (פרטי) / ∞ (פאבלי) |
| Notifications | Telegram Bot | ✅ | בלי הגבלה |
| LLM | Groq | ✅ | ~14K req/יום (llama-3.1-8b-instant) |

**Trade-offs מודעים** (פורטפוליו, לא production מסחרי):
- ה־API ב־Render נרדם אחרי 15 דק' idle. בקשה ראשונה אחרי שינה = ~30 שניות.
- אין live listeners. הסקרייפינג רץ כל שעה־שעתיים, לא real-time.
- אין proxy/captcha solver. captcha = retry בריצה הבאה.
- חשבון FB אישי — סיכון ban קיים תמיד.

---

## שלב 0 — הרשמות חיצוניות

**👤 USER — בלעדי, אני לא יכול לעשות בשמך**

- [x] **0.1 Turso** — `https://turso.tech` (אין צורך בכרטיס אשראי)
  1. Sign up with GitHub.
  2. Create database: `turso db create gethome` (דרך ה־CLI שלהם, או דרך ה־UI).
  3. שמור URL: `turso db show gethome --url` → תועתק ל־`TURSO_DATABASE_URL`.
  4. צור auth token: `turso db tokens create gethome` → תועתק ל־`TURSO_AUTH_TOKEN`.
  5. תן לי את שני הערכים האלה (או הכנס אותם ל־`.env` המקומי כשנגיע לשלב 2).

- [ ] **0.2 Telegram Bot**
  1. שלח הודעה ל־`@BotFather` בטלגרם → `/newbot` → תן שם → קבל **bot token**.
  2. שלח הודעה ל־`@userinfobot` → קבל את ה־**chat ID** שלך.
  3. שמור: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

- [ ] **0.3 Render** — `https://render.com`
  1. Sign up with GitHub (חינמי, אין CC).
  2. אל תיצור עדיין web service — נחבר אחרי שאדחוף את ה־`render.yaml`.

- [ ] **0.4 GitHub repo**
  1. ודא שהבק־אנד עולה ל־GitHub (פרטי או פאבלי).
  2. אם הוא פרטי — שים לב למכסת 2000 דקות. הסקרייפר שלנו צורך ~50 דק' ביום.

- [ ] **0.5 (אם רוצים) Groq API key חדש**
  המפתח ב־`.env` הנוכחי נחשף בשיחה. החלף אותו ב־`https://console.groq.com`.

---

## שלב 1 — שינויי קוד (Claude)

### 1.1 DB layer — מעבר ל־libSQL
- [x] 1.1.1 `npm install @libsql/client`, הסרת `better-sqlite3`
- [x] 1.1.2 שכתוב `db/pool.js` ל־`createClient` (אסינכרוני)
- [x] 1.1.3 שכתוב `db/setup.js` (migrations) ל־`client.execute`
- [x] 1.1.4 שכתוב `db/queries.js` — כל הפונקציות הופכות ל־`async`
- [x] 1.1.5 מחיקת `db/backfill-area.js` (one-time script, לא רלוונטי בפרודקשן)

### 1.2 התאמת callers ל־async
- [x] 1.2.1 `middleware/auth.js` — לא היה צריך שינוי (לא נוגע ב־DB)
- [x] 1.2.2 `routes/auth.js`, `routes/listings.js`, `routes/preferences.js` הומרו ל־async; `routes/scan.js`, `routes/sse.js`, `routes/listeners.js` נמחקו (לא רלוונטיים — אין listeners בפרודקשן)
- [x] 1.2.3 `notifications/matchingEngine.js` נכתב מחדש (post-scrape pass), `telegram.js` הומר ל־async, `sseManager.js` נמחק
- [x] 1.2.4 כל ה־`listeners/` נמחק (לא נדרש בארכיטקטורת GHA cron). הסקרייפינג עובר ל־`scraper/yad2/scraper.js` + `scraper/facebook/groupScraper.js` מ־`scripts/scrape-once.js`
- [x] 1.2.5 `scraper/yad2/urlBuilder.js`, `scraper/yad2/scraper.js` הומרו ל־async
- [x] 1.2.6 `scraper/facebook/auth.js` + `groupScraper.js` הומרו ל־async, FB session נשען על Turso
- [x] 1.2.7 `tasks/scheduler.js` נמחק; `tasks/scanManager.js` נכתב מחדש (async, מארגן את כל המחזור) + `pipeline/index.js` הומר ל־async

### 1.3 GHA scraper entry point
- [x] 1.3.1 כתיבת `scripts/scrape-once.js` — מריץ FB+Yad2 במחזור יחיד, שולח התראות, יוצא
- [x] 1.3.2 כתיבת `scripts/upload-fb-session.js` — להעלות session מקומי ל־Turso
- [x] 1.3.3 הוספת npm scripts: `scrape:once`, `session:upload`. הוסר `node-cron` מ־deps.

### 1.4 GitHub Actions workflow
- [x] 1.4.1 `.github/workflows/scrape.yml` — cron כל שעה + workflow_dispatch ידני
- [x] 1.4.2 שלב התקנת Playwright + הרצת `npm run scrape:once`

### 1.5 Render config
- [x] 1.5.1 `render.yaml` — Node service, build command, env vars placeholder
- [x] 1.5.2 הסרת `index.js` של ה־listeners (בפרודקשן ה־API לא מריץ סקרייפינג)
- [x] 1.5.3 מחיקת/השבתת `tasks/scheduler.js` (GHA מחליף אותו)

### 1.6 ניקוי
- [x] 1.6.1 מחיקת `Dockerfile` (לא נדרש ל־Render free)
- [x] 1.6.2 עדכון `.gitignore` — `fb_session.json`, `*.db*`, `.env`
- [x] 1.6.3 עדכון `.env.example` עם המפתחות החדשים
- [x] 1.6.4 README קצר שמפנה לתוכנית הזו

---

## שלב 2 — בדיקה מקומית

**👤 USER יחד איתי**

- [x] **2.1** Claude: יצירת `.env` עם המפתחות החדשים (Turso מחובר)
- [x] **2.2** USER: מילא Turso URL + token. נשאר: Telegram (אופציונלי כרגע)
  ```
  TURSO_DATABASE_URL=libsql://gethome-USERNAME.turso.io
  TURSO_AUTH_TOKEN=eyJ...
  TELEGRAM_BOT_TOKEN=...
  TELEGRAM_CHAT_ID=...
  GROQ_API_KEY=... (חדש, אם החלפת)
  FB_EMAIL=...
  FB_PASSWORD=...
  FB_GROUPS=https://www.facebook.com/groups/...,...
  JWT_SECRET=<משהו אקראי ארוך>
  ```
- [x] **2.3** Claude: ריצת migrations על Turso — 7 טבלאות נוצרו (listings, sessions, seen_posts, users, user_preferences, notification_log, sqlite_sequence)
- [x] **2.4** USER: התחברות ראשונית ל־FB — `fb_session.json` נוצר (4267 bytes, 11 cookies)
  ```
  npm run login-fb
  ```
  ידלוק browser → תתחבר ידנית → לחיצה Enter → ייווצר `fb_session.json`.
- [x] **2.5** USER: העלאת session ל־Turso — `session:upload` עברה, 11 cookies ב־`sessions` table
  ```
  npm run session:upload
  ```
- [x] **2.6** Claude+USER: בדיקת `npm run scrape:once` לוקאלית — **412 דירות** נכנסו ל־Turso (57 Yad2 + 355 FB heuristic), 28 דק', 0 שגיאות
- [x] **2.7** Claude+USER: בדיקת API לוקאלית — `GET /health` → ok; `GET /api/listings` מחזיר 412 דירות עם neighborhood/area/price נכונים

---

## שלב 3 — Deploy

**👤 USER עם הדרכה ממני**

- [ ] **3.1** Push לכל השינויים ל־`main` ב־GitHub
- [ ] **3.2** Render:
  1. כניסה ל־dashboard → New → Blueprint → לבחור את הרפו.
  2. Render יזהה את `render.yaml`.
  3. הכנס את ה־secrets:
     - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
     - `JWT_SECRET`
     - (אופציונלי) `CLIENT_URL=https://<vercel-app>.vercel.app`
  4. Deploy → קבל URL `https://gethome-api.onrender.com`
- [ ] **3.3** Vercel (frontend):
  1. בלוח של פרויקט ה־frontend → Settings → Environment Variables
  2. הוסף `VITE_API_URL=https://gethome-api.onrender.com`
  3. Redeploy
- [ ] **3.4** GitHub Actions secrets:
  בלוח הרפו → Settings → Secrets and variables → Actions → New secret:
  - `TURSO_DATABASE_URL`
  - `TURSO_AUTH_TOKEN`
  - `GROQ_API_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_CHAT_ID`
  - `FB_EMAIL`
  - `FB_PASSWORD`
  - `FB_GROUPS`
- [ ] **3.5** הרצה ידנית ראשונה של ה־workflow:
  Actions tab → "Scrape listings" → Run workflow → לראות שזה רץ ירוק.

---

## שלב 4 — אימות שהמערכת חיה

- [ ] **4.1** Render: `curl https://gethome-api.onrender.com/health` → `{"status":"ok"}`
- [ ] **4.2** Turso: לבדוק שיש שורות בטבלת `listings`
  ```
  turso db shell gethome "SELECT COUNT(*) FROM listings"
  ```
- [ ] **4.3** Frontend: לפתוח את האתר ב־Vercel → לראות מודעות.
- [ ] **4.4** Telegram: לקבל הודעת test אחרי הסקרייפ הראשון.

---

## סיכון, סף, שמירה

**מה לעקוב אחריו אחרי שהמערכת חיה**:
- GHA usage: Settings → Billing & plans → Actions minutes. אם הרפו פרטי, לעבור לפאבלי אם מתקרבים ל־2000.
- Turso usage: dashboard מציג writes/reads.
- חשבון FB: כל פעם שמתחברים מ־IP חדש (GHA = IP חדש בכל ריצה) → סיכון checkpoint. אם זה קורה — להתחבר ידנית מהדפדפן, להעלות session חדש.
- Groq quota: 14K req/day. אם נחסם — interval בין ריצות יוארך אוטומטית בקוד.

---
