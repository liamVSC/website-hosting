import { readFile } from "node:fs/promises";

const required = [
  "public/index.html",
  "public/order.html",
  "public/order.js",
  "public/order.css",
  "public/success.html",
  "public/cancel.html",
  "public/privacy.html",
  "public/terms.html",
  "public/favicon.svg",
  "public/site.webmanifest",
  "public/robots.txt",
  "public/404.html",
  "public/_headers",
  "src/index.js",
  "wrangler.jsonc"
];

for (const file of required) {
  await readFile(file);
}

const order = await readFile("public/order.html", "utf8");
const home = await readFile("public/index.html", "utf8");
const worker = await readFile("src/index.js", "utf8");

for (const pkg of ["starter", "business", "premium"]) {
  if (!order.includes(`value="${pkg}"`)) throw new Error(`Missing package option: ${pkg}`);
}
for (const path of ["order.html?package=starter", "order.html?package=business", "order.html?package=premium"]) {
  if (!home.includes(path)) throw new Error(`Missing package link: ${path}`);
}
for (const forbidden of ["hello@example.com", "0151 000 0000", "[YOUR EMAIL]", "PROJECT PHOTO", "Example customer"]) {
  const combined = home + order + worker;
  if (combined.includes(forbidden)) throw new Error(`Customer-facing placeholder remains: ${forbidden}`);
}
for (const marker of ["/api/checkout", "/api/stripe-webhook", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]) {
  if (!worker.includes(marker)) throw new Error(`Stripe integration missing: ${marker}`);
}

console.log("ProperSite validation passed.");
