# Bangla copy

Every user-facing string in the kit, with its Bangla equivalent. The files ship
in English (repo convention); if the target project's UI is Bangla, swap these
in as you copy rather than leaving a mixed-language screen.

Nothing else changes — same markup, same classes, same behaviour.

## `frontend-blade/auth/index.blade.php`

| English | Bangla |
|---|---|
| `Sign in` (tab, title, submit) | `লগইন` / `লগইন করুন` |
| `Register` (tab, title) | `রেজিস্ট্রেশন` |
| `Create account` (submit) | `রেজিস্ট্রেশন করুন` |
| `or sign in with email` | `অথবা ইমেইল দিয়ে লগইন` |
| `or register with email` | `অথবা ইমেইল দিয়ে` |
| `Email address` | `ইমেইল অ্যাড্রেস` |
| `Password` | `পাসওয়ার্ড` |
| `Repeat password` | `আবার লিখুন` |
| `Your name` | `আপনার নাম` |
| `Phone number` | `ফোন নম্বর` |
| `Show password` (aria) | `পাসওয়ার্ড দেখুন` |
| `Forgot your password?` | `পাসওয়ার্ড ভুলে গেছেন?` |

The Google prefill banner:

| English | Bangla |
|---|---|
| `No account on this email yet` | `এই ইমেইলে আপনার অ্যাকাউন্ট নেই — চলুন খুলে ফেলি` |
| `Your name and email have been filled in from Google. Just add your **phone number** and a **password** to finish — no email verification needed.` | `গুগল থেকে আপনার নাম ও ইমেইল নিয়ে বসিয়ে দেওয়া হয়েছে। শুধু **ফোন নম্বর** আর **পাসওয়ার্ড** দিলেই কাজ শেষ — ইমেইল যাচাই করতে হবে না।` |

## `frontend-blade/partials/google-auth.blade.php`

| English | Bangla |
|---|---|
| `Continue with Google` | `Continue with Google` (keep as is — Google's own wording) |
| `Please wait…` | `অপেক্ষা করুন…` |
| `Could not load the Google script` | `Google স্ক্রিপ্ট লোড করা যায়নি` |
| `Sign-in could not be completed. Please try again.` | `সাইন-ইন সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।` |
| `Google login is not configured yet.` | `Google লগইন এখনো কনফিগার করা হয়নি।` |
| `No token received from Google.` | `Google থেকে টোকেন পাওয়া যায়নি।` |
| `Google sign-in was cancelled.` | `Google সাইন-ইন বাতিল হয়েছে।` |
| `Google sign-in failed.` | `Google সাইন-ইন ব্যর্থ হয়েছে।` |

## `backend-laravel/Http/Controllers/GoogleAuthController.php`

| English | Bangla |
|---|---|
| `Google sign-in could not be verified. Please try again.` | `Google যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।` |

## `admin-react/GoogleCredentialsPanel.tsx`

| English | Bangla |
|---|---|
| `Google login` | `গুগল লগইন` |
| `Let people sign in with their Google account in one click.` | `শিক্ষার্থী এক ক্লিকে গুগল অ্যাকাউন্ট দিয়েই ঢুকতে পারবে।` |
| `Setup guide` | `সেটআপ গাইড` |
| `Client ID` | `Client ID` (keep — it is the console's own label) |
| `Client Secret (optional)` | `Client Secret (ঐচ্ছিক)` |
| `A secret is saved (encrypted)` | `একটি সিক্রেট সংরক্ষিত আছে (এনক্রিপ্ট করা)` |
| `Change or remove` | `বদলান বা মুছুন` |
| `Cancel — leave the saved secret alone` | `বাতিল করুন — সংরক্ষিত সিক্রেটটি যেমন আছে থাক` |
| `Save` / `Saving…` / `Saved` | `সংরক্ষণ করুন` / `সংরক্ষণ হচ্ছে…` / `সংরক্ষিত` |
| `No Client ID yet, so the Google button is hidden on the login page.` | `Client ID বসানো নেই, তাই লগইন পাতায় গুগলের বোতামটি এখন দেখাচ্ছে না।` |
| `Currently using the key from the server's .env.` | `এখন সার্ভারের .env ফাইলে বসানো চাবিটি চলছে।` |

Hints, in full:

- Client ID — `গুগল কনসোল থেকে পাওয়া আইডি — এটি গোপন নয়, লগইন পাতাতেই ব্যবহৃত হয়। ঘরটি খালি করলে গুগল লগইন বন্ধ হয়ে যাবে।`
- Client Secret — `এই লগইন পদ্ধতিতে লাগে না, খালি রাখলেও চলবে। বসালে এনক্রিপ্ট করে রাখা হয় এবং আর কখনো পর্দায় দেখানো হয় না।`
- Changing it — `নতুন সিক্রেট লিখুন — অথবা খালি রেখে সংরক্ষণ করলে সংরক্ষিত সিক্রেটটি মুছে যাবে।`

## `admin-react/GoogleSetupGuideModal.tsx`

| English | Bangla |
|---|---|
| `Google login setup` | `গুগল লগইন সেটআপ` |
| `Five steps, once. Every link opens in a new tab.` | `পাঁচটি ধাপ, একবারের কাজ। প্রতিটি লিংক নতুন ট্যাবে খুলবে।` |
| `Create a project` | `প্রজেক্ট তৈরি করুন` |
| `Fill in Branding` | `Branding পূরণ করুন` |
| `Create a client` | `Client তৈরি করুন` |
| `Publish the app` | `অ্যাপ পাবলিশ করুন` |
| `Copy the Client ID here` | `Client ID কপি করে এখানে বসান` |
| `New project page` / `Branding page` / `Clients page` / `Audience page` | `প্রজেক্ট তৈরির পাতা` / `Branding পাতা` / `Clients পাতা` / `Audience পাতা` |
| `Copy` / `Copied` | `কপি` / `কপি হয়েছে` |
| `Got it` | `বুঝেছি` |

Step bodies, in full:

1. `প্রজেক্টের একটি নাম দিয়ে CREATE। আগে থেকে প্রজেক্ট থাকলে উপরের বার থেকে সেটি বেছে নিন।`
2. `অ্যাপের নাম, লোগো ও সাপোর্ট ইমেইল দিন। তারপর App domain অংশে নিচের তিনটি ঠিকানা বসিয়ে SAVE চাপুন।`
3. `CREATE CLIENT → Application type-এ Web application → একটি নাম দিন। তারপর Authorized JavaScript origins অংশে + Add URI চেপে নিচের ঠিকানাগুলো যোগ করুন।` + `নিচের Authorized redirect URIs অংশটি খালি রাখুন — এই পদ্ধতিতে ওটি লাগে না। এরপর CREATE।`
4. `PUBLISH APP চেপে অবস্থা In production করুন। এই সাইট গুগলের কাছে শুধু নাম, ইমেইল ও ছবি চায় — তাই কোনো রিভিউয়ের অপেক্ষা নেই, চাপার সাথে সাথেই সবার জন্য চালু হয়ে যাবে।`
5. `Clients তালিকা থেকে Client ID কপি করে এই পাতার ঘরে বসান, তারপর সংরক্ষণ করুন। এরপর লগইন পাতায় গিয়ে পরীক্ষা করে দেখুন।`

## A note on the phone field

The registration form ships with a plain `tel` input. For a Bangladeshi project,
add the 11-digit normalise-and-validate rule (`01XXXXXXXXX`) on both sides, and
these messages:

- `ফোন নম্বর দিন।` — required
- `সঠিক ১১ সংখ্যার ফোন নম্বর দিন।` — wrong length
- `সঠিক বাংলাদেশি ফোন নম্বর দিন (যেমন: 01712345678)।` — wrong shape
