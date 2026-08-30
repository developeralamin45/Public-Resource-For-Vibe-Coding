<?php

/**
 * THE EVENT CATALOGUE — the one file that makes this kit project-agnostic.
 *
 * Every email your app can send is declared here once. The admin panel reads
 * this catalogue to build its UI, the seeder copies it into `email_templates`
 * (where the admin can then edit subject/body and switch each event on or off),
 * and EmailDispatcher::fire('<key>', ...) is the only call your business logic
 * ever needs to make.
 *
 * ── Adapting this to a project ──────────────────────────────────────────────
 * Pick the preset that matches what you are building and set EMAIL_PRESET in
 * .env, or write your own under 'custom'. An e-commerce build wants order.*
 * events; a SaaS wants billing.*; an organisation site wants contact.*. Delete
 * what you don't need — an event nobody fires is dead weight in the admin UI.
 *
 * ── Anatomy of an event ─────────────────────────────────────────────────────
 *   label            Human name shown in the admin panel.
 *   group            Section heading the admin panel groups it under.
 *   audience         Who receives it — 'user' or 'admin'. Documentation only,
 *                    but it tells the admin why an event exists.
 *   critical         TRUE = the recipient is actively WAITING for it (OTP,
 *                    password reset). Critical mail ignores quiet hours and the
 *                    dedupe window, and the admin UI warns before it is
 *                    switched off. Anything a human is blocked on is critical.
 *   default_enabled  Whether the seeder switches it on out of the box.
 *   variables        {placeholder} => description. The admin panel renders these
 *                    as click-to-insert chips, so write the descriptions for a
 *                    non-technical reader.
 *   subject / body   Starting content. Once seeded the DB row wins — this stays
 *                    as the default the admin can always "reset to".
 *
 * Placeholders use {curly_braces} and are replaced literally. A placeholder you
 * never pass renders as an empty string, never as the literal "{name}".
 * {app_name} is injected for you in every template.
 */

return [

    /*
    |---------------------------------------------------------------------------
    | Active preset
    |---------------------------------------------------------------------------
    | 'saas' | 'ecommerce' | 'organization' | 'custom'
    */
    'preset' => env('EMAIL_PRESET', 'saas'),

    /*
    |---------------------------------------------------------------------------
    | Branding used by the shared email layout
    |---------------------------------------------------------------------------
    */
    'brand' => [
        'name'        => env('APP_NAME', 'Your App'),
        'logo_url'    => env('EMAIL_LOGO_URL', ''),
        'site_url'    => env('APP_URL', ''),
        'accent'      => env('EMAIL_ACCENT', '#4f46e5'),
        'footer_note' => env('EMAIL_FOOTER_NOTE', ''),
    ],

    /*
    |---------------------------------------------------------------------------
    | Events every project has. Merged into whichever preset is active, so you
    | never have to repeat them.
    |---------------------------------------------------------------------------
    */
    'common' => [

        'account.welcome' => [
            'label'    => 'Welcome / account created',
            'group'    => 'Account',
            'audience' => 'user',
            'critical' => false,
            'default_enabled' => true,
            'variables' => [
                'name'      => 'The name of the person',
                'account'   => 'Account or business name',
                'login_url' => 'Link to the login page',
            ],
            'subject' => 'Welcome to {app_name}, {name}',
            'body'    => '<p>Hi {name},</p>
<p>Your account <b>{account}</b> is ready. You can sign in any time and pick up where you left off.</p>
<p><a class="btn" href="{login_url}">Open {app_name}</a></p>
<p>If you ever get stuck, just reply to this email — a human reads it.</p>',
        ],

        'account.otp' => [
            'label'    => 'Verification code (OTP)',
            'group'    => 'Account',
            'audience' => 'user',
            'critical' => true,
            'default_enabled' => true,
            'variables' => [
                'name'        => 'The name of the person',
                'otp'         => 'The one-time code',
                'expiry_mins' => 'Minutes until the code expires',
            ],
            'subject' => 'Your verification code: {otp}',
            'body'    => '<p>Hi {name},</p>
<p>Your verification code is:</p>
<p class="code">{otp}</p>
<p>It expires in {expiry_mins} minutes. If you did not request it, you can ignore this email.</p>',
        ],

        'account.password_reset' => [
            'label'    => 'Password reset link',
            'group'    => 'Account',
            'audience' => 'user',
            'critical' => true,
            'default_enabled' => true,
            'variables' => [
                'name'        => 'The name of the person',
                'reset_url'   => 'The one-time reset link',
                'expiry_mins' => 'Minutes until the link expires',
            ],
            'subject' => 'Reset your {app_name} password',
            'body'    => '<p>Hi {name},</p>
<p>Someone asked to reset the password for this account. If it was you, use the button below.</p>
<p><a class="btn" href="{reset_url}">Set a new password</a></p>
<p>The link works for {expiry_mins} minutes and once only. If this was not you, nothing has changed — you can safely ignore this email.</p>',
        ],

        'account.password_changed' => [
            'label'    => 'Password was changed',
            'group'    => 'Account',
            'audience' => 'user',
            'critical' => false,
            'default_enabled' => true,
            'variables' => [
                'name' => 'The name of the person',
                'when' => 'When it happened',
            ],
            'subject' => 'Your password was changed',
            'body'    => '<p>Hi {name},</p>
<p>The password on your account was changed on {when}.</p>
<p>If that was you, no action is needed. If it was not, contact us immediately.</p>',
        ],
    ],

    /*
    |---------------------------------------------------------------------------
    | Presets
    |---------------------------------------------------------------------------
    */
    'presets' => [

        // ── SaaS / subscription product ────────────────────────────────────
        'saas' => [

            'billing.payment_received' => [
                'label'    => 'Payment received',
                'group'    => 'Billing',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'        => 'The name of the customer',
                    'amount'      => 'Amount paid',
                    'plan'        => 'Plan name',
                    'valid_till'  => 'New expiry date',
                    'invoice_url' => 'Link to the invoice',
                ],
                'subject' => 'Payment received — {plan} is active till {valid_till}',
                'body'    => '<p>Hi {name},</p>
<p>We received your payment of <b>{amount}</b>. Your <b>{plan}</b> plan is active until <b>{valid_till}</b>.</p>
<p><a class="btn" href="{invoice_url}">View invoice</a></p>
<p>Thank you for staying with us.</p>',
            ],

            'billing.trial_ending' => [
                'label'    => 'Trial ending soon',
                'group'    => 'Billing',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'        => 'The name of the customer',
                    'days_left'   => 'Days remaining',
                    'expiry_date' => 'Date the trial ends',
                    'upgrade_url' => 'Link to the upgrade page',
                ],
                'subject' => 'Your trial ends in {days_left} days',
                'body'    => '<p>Hi {name},</p>
<p>Your free trial ends on <b>{expiry_date}</b> — that is {days_left} days from now. Upgrade before then and nothing in your account is interrupted.</p>
<p><a class="btn" href="{upgrade_url}">Choose a plan</a></p>',
            ],

            'billing.subscription_expired' => [
                'label'    => 'Subscription expired',
                'group'    => 'Billing',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'       => 'The name of the customer',
                    'plan'       => 'Plan that expired',
                    'renew_url'  => 'Link to renew',
                    'grace_days' => 'Days of grace access left',
                ],
                'subject' => 'Your {plan} plan has expired',
                'body'    => '<p>Hi {name},</p>
<p>Your <b>{plan}</b> plan expired. Your data is safe and waiting — renew to get straight back in. You have {grace_days} days before access is paused.</p>
<p><a class="btn" href="{renew_url}">Renew now</a></p>',
            ],

            'billing.invoice' => [
                'label'    => 'Invoice / receipt',
                'group'    => 'Billing',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => false,
                'variables' => [
                    'name'        => 'The name of the customer',
                    'invoice_no'  => 'Invoice number',
                    'amount'      => 'Invoice total',
                    'due_date'    => 'Payment due date',
                    'invoice_url' => 'Link to the invoice',
                ],
                'subject' => 'Invoice {invoice_no} — {amount}',
                'body'    => '<p>Hi {name},</p>
<p>Invoice <b>{invoice_no}</b> for <b>{amount}</b> is ready. Payment is due by {due_date}.</p>
<p><a class="btn" href="{invoice_url}">View invoice</a></p>',
            ],

            'admin.new_signup' => [
                'label'    => 'New signup (to your team)',
                'group'    => 'Internal',
                'audience' => 'admin',
                'critical' => false,
                'default_enabled' => false,
                'variables' => [
                    'name'    => 'Who signed up',
                    'email'   => 'Their email',
                    'phone'   => 'Their phone',
                    'account' => 'Business / account name',
                ],
                'subject' => 'New signup: {account}',
                'body'    => '<p><b>{name}</b> just created an account.</p>
<ul><li>Account: {account}</li><li>Email: {email}</li><li>Phone: {phone}</li></ul>',
            ],
        ],

        // ── E-commerce / online store ──────────────────────────────────────
        'ecommerce' => [

            'order.placed' => [
                'label'    => 'Order placed',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'        => 'The name of the customer',
                    'order_id'    => 'Order number',
                    'order_total' => 'Order total',
                    'items_html'  => 'The item list (HTML table)',
                    'order_url'   => 'Link to track the order',
                ],
                'subject' => 'We got your order #{order_id}',
                'body'    => '<p>Hi {name},</p>
<p>Thanks for your order. We have received it and will start packing shortly.</p>
{items_html}
<p><b>Total: {order_total}</b></p>
<p><a class="btn" href="{order_url}">Track your order</a></p>',
            ],

            'order.confirmed' => [
                'label'    => 'Order confirmed',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'      => 'The name of the customer',
                    'order_id'  => 'Order number',
                    'order_url' => 'Link to track the order',
                ],
                'subject' => 'Order #{order_id} confirmed',
                'body'    => '<p>Hi {name},</p>
<p>Your order <b>#{order_id}</b> is confirmed and is being prepared.</p>
<p><a class="btn" href="{order_url}">Track your order</a></p>',
            ],

            'order.shipped' => [
                'label'    => 'Order shipped',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'         => 'The name of the customer',
                    'order_id'     => 'Order number',
                    'courier'      => 'Courier name',
                    'tracking_no'  => 'Tracking number',
                    'tracking_url' => 'Courier tracking link',
                    'eta'          => 'Expected delivery date',
                ],
                'subject' => 'Order #{order_id} is on the way',
                'body'    => '<p>Hi {name},</p>
<p>Your order <b>#{order_id}</b> has been handed to <b>{courier}</b>.</p>
<p>Tracking number: <b>{tracking_no}</b><br>Expected delivery: {eta}</p>
<p><a class="btn" href="{tracking_url}">Track shipment</a></p>',
            ],

            'order.delivered' => [
                'label'    => 'Order delivered',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'       => 'The name of the customer',
                    'order_id'   => 'Order number',
                    'review_url' => 'Link to leave a review',
                ],
                'subject' => 'Your order #{order_id} was delivered',
                'body'    => '<p>Hi {name},</p>
<p>Order <b>#{order_id}</b> has been delivered. We hope you love it.</p>
<p><a class="btn" href="{review_url}">Leave a review</a></p>',
            ],

            'order.cancelled' => [
                'label'    => 'Order cancelled',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'     => 'The name of the customer',
                    'order_id' => 'Order number',
                    'reason'   => 'Why it was cancelled',
                ],
                'subject' => 'Order #{order_id} was cancelled',
                'body'    => '<p>Hi {name},</p>
<p>Your order <b>#{order_id}</b> has been cancelled.</p>
<p>Reason: {reason}</p>
<p>If a payment was taken, the refund is on its way.</p>',
            ],

            'order.refunded' => [
                'label'    => 'Refund issued',
                'group'    => 'Orders',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'          => 'The name of the customer',
                    'order_id'      => 'Order number',
                    'amount'        => 'Refunded amount',
                    'refund_method' => 'Where the money went back to',
                ],
                'subject' => 'Refund issued for order #{order_id}',
                'body'    => '<p>Hi {name},</p>
<p>We have refunded <b>{amount}</b> for order <b>#{order_id}</b> to {refund_method}. Banks usually take a few working days to show it.</p>',
            ],

            'payment.received' => [
                'label'    => 'Payment received',
                'group'    => 'Payments',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'     => 'The name of the customer',
                    'amount'   => 'Amount paid',
                    'order_id' => 'Order number',
                    'method'   => 'Payment method',
                ],
                'subject' => 'Payment of {amount} received',
                'body'    => '<p>Hi {name},</p>
<p>We received <b>{amount}</b> via {method} for order <b>#{order_id}</b>. Thank you.</p>',
            ],

            'payment.failed' => [
                'label'    => 'Payment failed',
                'group'    => 'Payments',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'      => 'The name of the customer',
                    'order_id'  => 'Order number',
                    'retry_url' => 'Link to try paying again',
                ],
                'subject' => 'Payment could not be completed',
                'body'    => '<p>Hi {name},</p>
<p>We could not complete the payment for order <b>#{order_id}</b>. Your order is being held — you can try again below.</p>
<p><a class="btn" href="{retry_url}">Retry payment</a></p>',
            ],

            'cart.abandoned' => [
                'label'    => 'Abandoned cart reminder',
                'group'    => 'Marketing',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => false,
                'variables' => [
                    'name'       => 'The name of the customer',
                    'items_html' => 'The items left in the cart',
                    'cart_url'   => 'Link back to the cart',
                ],
                'subject' => '{name}, you left something behind',
                'body'    => '<p>Hi {name},</p>
<p>Your cart is still saved. Pick up where you left off:</p>
{items_html}
<p><a class="btn" href="{cart_url}">Return to cart</a></p>',
            ],

            'admin.new_order' => [
                'label'    => 'New order (to your team)',
                'group'    => 'Internal',
                'audience' => 'admin',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'order_id'    => 'Order number',
                    'customer'    => 'Customer name',
                    'phone'       => 'Customer phone',
                    'order_total' => 'Order total',
                    'items_html'  => 'The item list',
                    'admin_url'   => 'Link to the order in the admin panel',
                ],
                'subject' => 'New order #{order_id} — {order_total}',
                'body'    => '<p><b>{customer}</b> ({phone}) placed order <b>#{order_id}</b> for <b>{order_total}</b>.</p>
{items_html}
<p><a class="btn" href="{admin_url}">Open in admin</a></p>',
            ],
        ],

        // ── Organisation / service site ────────────────────────────────────
        'organization' => [

            'contact.received' => [
                'label'    => 'Contact form received (to your team)',
                'group'    => 'Internal',
                'audience' => 'admin',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'    => 'Who wrote in',
                    'email'   => 'Their email',
                    'phone'   => 'Their phone',
                    'message' => 'What they wrote',
                ],
                'subject' => 'New enquiry from {name}',
                'body'    => '<p><b>{name}</b> sent an enquiry.</p>
<ul><li>Email: {email}</li><li>Phone: {phone}</li></ul>
<p>{message}</p>',
            ],

            'contact.acknowledged' => [
                'label'    => 'Enquiry acknowledgement',
                'group'    => 'Enquiries',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'         => 'Who wrote in',
                    'reply_within' => 'How soon you will reply',
                ],
                'subject' => 'We received your message',
                'body'    => '<p>Hi {name},</p>
<p>Thanks for getting in touch — your message has reached us and we will reply within {reply_within}.</p>',
            ],

            'appointment.confirmed' => [
                'label'    => 'Appointment confirmed',
                'group'    => 'Appointments',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'     => 'The name of the person',
                    'date'     => 'Appointment date',
                    'time'     => 'Appointment time',
                    'location' => 'Where to go',
                ],
                'subject' => 'Your appointment on {date} is confirmed',
                'body'    => '<p>Hi {name},</p>
<p>Your appointment is confirmed for <b>{date} at {time}</b>.</p>
<p>Location: {location}</p>',
            ],

            'appointment.reminder' => [
                'label'    => 'Appointment reminder',
                'group'    => 'Appointments',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => true,
                'variables' => [
                    'name'     => 'The name of the person',
                    'date'     => 'Appointment date',
                    'time'     => 'Appointment time',
                    'location' => 'Where to go',
                ],
                'subject' => 'Reminder: your appointment is on {date}',
                'body'    => '<p>Hi {name},</p>
<p>A quick reminder about your appointment on <b>{date} at {time}</b> ({location}).</p>',
            ],

            'notice.general' => [
                'label'    => 'General notice / announcement',
                'group'    => 'Announcements',
                'audience' => 'user',
                'critical' => false,
                'default_enabled' => false,
                'variables' => [
                    'name'    => 'The name of the person',
                    'title'   => 'Notice title',
                    'message' => 'Notice body',
                ],
                'subject' => '{title}',
                'body'    => '<p>Hi {name},</p>
<p>{message}</p>',
            ],
        ],

        /*
        | Your own catalogue. Set EMAIL_PRESET=custom and declare events here
        | when the project fits none of the presets above. Same shape as any
        | event you can see in them — copy one and edit it.
        */
        'custom' => [
            // 'ticket.replied' => [ ... ],
        ],
    ],
];
