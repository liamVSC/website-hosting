# ProperSite

ProperSite is a simple website business system for £50, £100 and £150 local-business websites.

## Packages
- `templates/starter` — £50 one-page conversion site.
- `templates/business` — £100 multi-section business site.
- `templates/premium` — £150 premium presentation site.

## Production stack
- GitHub — source control.
- Cloudflare Workers Static Assets — hosting and lightweight API.
- Stripe Checkout — secure card payment.
- No Vercel and no GitHub Pages.

## Stripe setup
The site creates the £50/£100/£150 Checkout Session server-side. Prices are fixed in `src/index.js`, so a customer cannot change the amount from the browser.

Set these Cloudflare Worker secrets:
- `STRIPE_SECRET_KEY` — Stripe secret API key.
- `STRIPE_WEBHOOK_SECRET` — signing secret for the Stripe webhook.

Stripe webhook endpoint:
`https://YOUR-DOMAIN/api/stripe-webhook`

Subscribe to `checkout.session.completed`.

The customer's website brief is attached to the Stripe Checkout Session as metadata. Stripe metadata allows up to 50 keys and 500 characters per value; longer fields are chunked by the Worker.

After adding the secrets and webhook, deploy the Worker and test with Stripe test mode before switching to live mode.

## Order flow
Customer chooses a package → submits the brief → ProperSite creates Stripe Checkout → Stripe collects payment → customer returns to the success page → Stripe sends the signed webhook.

## Legal
The site includes plain-language privacy and service terms pages. These are a starting point, not legal advice.
