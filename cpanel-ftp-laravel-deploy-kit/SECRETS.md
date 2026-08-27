# 🔑 GitHub Secrets & Variables — সেটআপ গাইড

> এই গাইডটা **cPanel / shared hosting (FTP)** এর জন্য। সার্ভারে SSH থাকলে
> [`../github-actions-laravel-deploy-kit/`](../github-actions-laravel-deploy-kit/)
> কিটটা ব্যবহার করুন — ওটার secrets আলাদা (`SERVER_IP`, `SERVER_SSH_KEY`,
> `SERVER_USERNAME`, `PROJECT_PATH`)।

এই ফাইলটাই সেই কাজের তালিকা যেটা **আপনাকে হাতে করতে হবে**। বাকি সবকিছু
workflow নিজে করে নেয়।

**কোথায় বসাবেন:**
আপনার GitHub রিপোজিটরি → **Settings** → বাম পাশে **Secrets and variables** →
**Actions**। সেখানে দুইটা ট্যাব আছে:

| ট্যাব | কী রাখবেন | কেন |
|---|---|---|
| **Secrets** | পাসওয়ার্ড, key, DB credentials | একবার সেভ করলে আর দেখা যায় না, log-এ `***` হয়ে যায় |
| **Variables** | ডোমেইন, PHP version, on/off সুইচ | সাধারণ কনফিগ, দেখা যায়, যখন-তখন বদলানো যায় |

> ⚠️ **DB পাসওয়ার্ড ও FTP পাসওয়ার্ড কখনো Variables-এ রাখবেন না** —
> Variables গুলো log-এ প্লেইন টেক্সটে চলে আসতে পারে।

---

## 📋 কী কী বসাতে হবে

Workflow ফাইল: `workflows/deploy.yml`

### Secrets (৮টি)

```text
APP_KEY=base64:x+P0ExampleKeyHerePleaseReplaceThis=
FTP_HOST=123.456.78.90
FTP_USERNAME=your_cpanel_username
FTP_PASSWORD=your_cpanel_password
DB_DATABASE=cpaneluser_yourdb
DB_USERNAME=cpaneluser_dbuser
DB_PASSWORD=your_database_password
DEPLOY_SECRET=MySuperSecretKey2026
```

| # | Secret | কী দিবেন | কোথায় পাবেন / কেন লাগবে |
|---|---|---|---|
| 1 | `APP_KEY` | `base64:...` দিয়ে শুরু হওয়া key | লোকাল `.env` থেকে কপি করুন, অথবা `php artisan key:generate --show` চালিয়ে যেটা প্রিন্ট হয় সেটা। **সব encrypted ডাটা ও session এই key দিয়ে খোলে — একবার লাইভ হওয়ার পর এটা বদলাবেন না**, বদলালে পুরনো session/encrypted কলাম নষ্ট হবে। |
| 2 | `FTP_HOST` | সার্ভারের IP অথবা হোস্টনেম (যেমন `15.235.228.208`) | cPanel → হোম পেজের ডান পাশে "Shared IP Address"। GitHub এই ঠিকানায় ফাইল পাঠাবে। `http://` বা শেষের `/` দেয়ার দরকার নেই — workflow নিজেই ছেঁটে নেয়। |
| 3 | `FTP_USERNAME` | cPanel লগইন ইউজারনেম, অথবা আলাদা তৈরি করা FTP অ্যাকাউন্ট | cPanel → FTP Accounts। আলাদা FTP অ্যাকাউন্ট বানানো বেশি নিরাপদ — তার home directory প্রজেক্ট ফোল্ডারে সেট করে দিন। |
| 4 | `FTP_PASSWORD` | ওই অ্যাকাউন্টের পাসওয়ার্ড | ফাইল আপলোডের পারমিশন। |
| 5 | `DB_DATABASE` | ডাটাবেজের **পুরো** নাম, prefix সহ (`cpaneluser_dbname`) | cPanel → MySQL® Databases। prefix বাদ দিলে "Unknown database" এরর আসবে। |
| 6 | `DB_USERNAME` | ডাটাবেজ ইউজারের পুরো নাম (`cpaneluser_dbuser`) | একই পেজ। ইউজারটিকে ডাটাবেজে **ALL PRIVILEGES** দিতে ভুলবেন না। |
| 7 | `DB_PASSWORD` | ডাটাবেজ ইউজারের পাসওয়ার্ড | একই পেজ। |
| 8 | `DEPLOY_SECRET` | আপনার নিজের বানানো লম্বা random টেক্সট | সার্ভারে বসা `deploy-hook.php` শুধু এই টোকেন পেলেই কাজ করে। **শুধু `A-Z a-z 0-9 _ -` ব্যবহার করুন**, স্পেস/স্ল্যাশ নয়। বানানোর সহজ উপায়: `openssl rand -hex 24`। |

> 🔒 `DEPLOY_SECRET`-এর **প্লেইন টেক্সট কখনো সার্ভারে যায় না** — workflow শুধু
> তার sha256 hash সার্ভারে লেখে, আর প্রতিবার হ্যাশ মিলিয়ে দেখে।

### Variables

| Variable | উদাহরণ | লাগবেই? | কাজ |
|---|---|---|---|
| `APP_URL` | `https://yoursite.com` | ✅ **হ্যাঁ** | সাইটের ঠিকানা। deploy শেষে এই URL হিট করে ২০০ এসেছে কিনা যাচাই করা হয়। |
| `FTP_SERVER_DIR` | `/yoursite.com/` | ✅ **হ্যাঁ** | FTP লগইনের পর ফাইল কোথায় রাখবে। **শেষে `/` দিতেই হবে।** ভুল পাথ = সবচেয়ে common deploy ফেইলিওর (নিচে দেখুন)। |
| `APP_NAME` | `Alor Kafela` | ➖ | সাইটের নাম (`.env`-এ যায়)। |
| `PHP_VERSION` | `8.2` | ➖ | **সার্ভারের PHP-র সাথে মিলিয়ে দিন**, না মিললে vendor/ ভুল ভার্সনের জন্য বিল্ড হবে। |
| `NODE_VERSION` | `20` | ➖ | ডিফল্ট 20। |
| `RUN_SEEDER` | `true` | ➖ | প্রতি deploy-এ `db:seed --force` চালাবে। **শুধু তখনই `true` করুন যখন আপনার `DatabaseSeeder` idempotent** (`updateOrCreate` ব্যবহার করে), নইলে প্রতিবার ডুপ্লিকেট ডাটা তৈরি হবে। প্রথম deploy-এ admin ইউজার তৈরির জন্য দরকারি। |
| `ROUTE_CACHE` | `false` | ➖ | ডিফল্ট বন্ধ। `routes/web.php`-এ **closure route** থাকলে `route:cache` ফেল করে — তাই সব closure কন্ট্রোলারে সরানোর আগ পর্যন্ত এটা `false` রাখুন। |
| `APP_DEBUG` | `false` | ➖ | ডিফল্ট `false`। শুধু ৫০০ এরর খুঁজতে সাময়িকভাবে `true` করুন, **কাজ শেষে অবশ্যই আবার `false`** — নইলে এরর পেজে DB পাসওয়ার্ড পর্যন্ত দেখা যায়। |
| `UPLOAD_ROOT_HTACCESS` | `true` | ➖ | ডোমেইনের document root যদি প্রজেক্ট রুটে থাকে (সাধারণ cPanel) → `true`। যদি সরাসরি `public/`-এ সেট করা থাকে → `false`। |
| `FTP_PROTOCOL` | `ftps` | ➖ | হোস্ট explicit FTPS সাপোর্ট করলে `ftps` দিন (বেশি নিরাপদ)। ডিফল্ট `ftp`। |
| `FTP_PORT` | `21` | ➖ | ডিফল্ট 21। |
| `DEPLOY_STRICT` | `true` | ➖ | কোনো artisan কমান্ড ফেল করলে deploy লাল করে দেয়। `false` দিলে শুধু warning। |
| `LOG_LEVEL`, `APP_LOCALE`, `APP_TIMEZONE`, `DB_HOST`, `DB_PORT`, `MAIL_MAILER`, `MAIL_FROM_ADDRESS` | | ➖ | `.env`-এর ওই লাইনগুলো ওভাররাইড করে। |

#### `FTP_SERVER_DIR` ঠিক করবেন কীভাবে?

FileZilla / cPanel File Manager দিয়ে FTP-তে লগইন করুন এবং দেখুন
`app/`, `public/`, `vendor/` ফোল্ডারগুলো কোন পাথে আছে — **সেই পাথটাই** বসাবেন।

| আপনার সেটআপ | সাধারণত যা হয় |
|---|---|
| Addon domain / subdomain | `/yoursite.com/` |
| Main domain, প্রজেক্ট রুটেই | `/public_html/` |
| Main domain, সাবফোল্ডারে | `/public_html/myapp/` |
| FTP অ্যাকাউন্টের home ইতিমধ্যে প্রজেক্ট ফোল্ডার | `./` |

---

## ➕ EXTRA_ENV — বাড়তি `.env` লাইন

Mail credentials, payment key, seeder-এর admin পাসওয়ার্ড — এসব যোগ করতে
workflow ফাইল এডিট করার দরকার নেই। `EXTRA_ENV` নামে **একটা secret** বানান
এবং তার ভেতরে যত খুশি লাইন দিন:

```text
MAIL_MAILER=smtp
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=you@gmail.com
MAIL_PASSWORD=your_app_password
ADMIN_EMAIL=admin@yoursite.com
ADMIN_PASSWORD=a-strong-password
```

লাইনগুলো হুবহু `.env`-এর শেষে বসে যাবে, তাই আগের কোনো লাইনকে ওভাররাইডও করতে
পারে (Laravel পরের মানটাই নেয়)।

---

## ✅ প্রথম deploy-এর আগে চেকলিস্ট

- [ ] cPanel/CloudPanel-এ ডাটাবেজ + ডাটাবেজ ইউজার তৈরি, ইউজারকে ALL PRIVILEGES দেয়া
- [ ] সার্ভারের PHP ভার্সন `PHP_VERSION`-এর সমান (cPanel → Select PHP Version)
- [ ] PHP extension চালু: `zip`, `gd`, `intl`, `pdo_mysql`, `mbstring`, `fileinfo`
- [ ] `upload_max_filesize=25M`, `post_max_size=30M`, `memory_limit=256M` (ছবি আপলোড থাকলে)
- [ ] উপরের সব Secrets ও Variables বসানো হয়েছে
- [ ] `.env` **git-এ কমিট করা নেই** (`.gitignore`-এ আছে কিনা দেখুন)
- [ ] `RUN_SEEDER=true` দিলে `DatabaseSeeder` idempotent (`updateOrCreate`)

তারপর `main` ব্রাঞ্চে push করুন — অথবা GitHub → **Actions** ট্যাব →
workflow সিলেক্ট করে **Run workflow** চাপুন।

---

## 🩺 লাইভ সার্ভারের অবস্থা দেখার এক-লাইন কমান্ড

```
https://yoursite.com/deploy-hook.php?token=YOUR_DEPLOY_SECRET&action=health
```

এটা JSON-এ বলে দেয়: PHP ভার্সন, `zip` extension আছে কিনা, `vendor/`/`.env`
আছে কিনা, ফোল্ডার লেখা যাচ্ছে কিনা, আর **এই মুহূর্তে কোন commit লাইভ আছে**।
কিছু ভাঙলে সবার আগে এটাই চালান — বেশিরভাগ প্রশ্নের উত্তর এখানেই মেলে।

সমস্যা হলে → [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)
