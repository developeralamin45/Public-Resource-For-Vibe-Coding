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

## `frontend-blade/auth/google-phone.blade.php`

| English | Bangla |
|---|---|
| `Your phone number` (title) | `ফোন নম্বর দিন` |
| `Enter your phone number` | `আপনার ফোন নম্বর লিখুন` |
| `Just this one step — then your account is ready.` | `আর মাত্র এই একটি ধাপ — তারপরই আপনার অ্যাকাউন্ট তৈরি।` |
| `Your name` | `আপনার নাম` |
| `Phone number` | `ফোন নম্বর` |
| `Finish` | `সম্পন্ন করুন` |
| `Want to use a different email?` | `অন্য ইমেইল ব্যবহার করতে চান?` |
| `Use the regular form` | `সাধারণ ফর্মে যান` |

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
| `The Google window was blocked. Allow pop-ups for this site and try again.` | `Google-এর উইন্ডোটি খুলতে দেওয়া হয়নি। এই সাইটের জন্য পপ-আপ চালু করে আবার চেষ্টা করুন।` |
| `No connection. Check your internet and try again.` | `ইন্টারনেট সংযোগ নেই। সংযোগ দেখে আবার চেষ্টা করুন।` |
| `This page has been open too long. Refresh it and try again.` | `পাতাটি অনেকক্ষণ খোলা ছিল। রিফ্রেশ করে আবার চেষ্টা করুন।` |
| `Google sign-in failed.` | `Google সাইন-ইন ব্যর্থ হয়েছে।` |

## `backend-laravel/Http/Controllers/GoogleAuthController.php`

| English | Bangla |
|---|---|
| `Google sign-in could not be verified. Please try again.` | `Google যাচাই ব্যর্থ হয়েছে। আবার চেষ্টা করুন।` |
| `For your security the old password on this account was cancelled, because its email had never been verified. You can always sign in with Google; to use a password, set a new one from "Forgot your password?".` | `নিরাপত্তার জন্য এই অ্যাকাউন্টের পুরোনো পাসওয়ার্ডটি বাতিল করা হয়েছে, কারণ ইমেইলটি আগে কখনো যাচাই করা হয়নি। Google দিয়ে যেকোনো সময় ঢুকতে পারবেন; পাসওয়ার্ড দিয়ে ঢুকতে চাইলে "পাসওয়ার্ড ভুলে গেছেন" থেকে নতুন একটি সেট করুন।` |

## `backend-laravel/Http/Controllers/GoogleAuthApiController.example.php`

| English | Bangla |
|---|---|
| `Google sign-in has expired. Please sign in again.` | `Google যাচাইয়ের সময় শেষ। আবার লগইন করুন।` |
| `Enter your name.` | `আপনার নাম দিন।` |
| `This email is already registered. Please sign in.` | `এই ইমেইলটি ইতিমধ্যে নিবন্ধিত। অনুগ্রহ করে লগইন করুন।` |

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

## `backend-laravel/Support/Phone.php` — `messages()`

| English | Bangla |
|---|---|
| `Enter your phone number.` | `ফোন নম্বর দিন।` |
| `Enter a valid 11-digit phone number.` | `সঠিক ১১ সংখ্যার ফোন নম্বর দিন।` |
| `Enter a valid Bangladeshi mobile number (e.g. 01712345678).` | `সঠিক বাংলাদেশি ফোন নম্বর দিন (যেমন: 01712345678)।` |

Registration messages worth translating in the project's own create-user path:
`আপনার নাম দিন।` · `ইমেইল অ্যাড্রেস দিন।` · `এই ইমেইলটি ইতিমধ্যে নিবন্ধিত।`
