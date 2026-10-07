import { readFile } from "node:fs/promises";

const required=["public/index.html","public/order.html","public/order.js","public/order.css","public/maintenance.html","public/maintenance.css","public/maintenance.js","public/success.html","public/cancel.html","public/privacy.html","public/terms.html","public/favicon.svg","public/site.webmanifest","public/robots.txt","public/404.html","public/_headers","src/index.js","wrangler.jsonc"];
for(const file of required)await readFile(file);
const order=await readFile("public/order.html","utf8");const home=await readFile("public/index.html","utf8");const maintenance=await readFile("public/maintenance.html","utf8");const worker=await readFile("src/index.js","utf8");
for(const pkg of ["starter","business","premium"])if(!order.includes(`value="${pkg}"`))throw new Error(`Missing package option: ${pkg}`);
for(const path of ["order.html?package=starter","order.html?package=business","order.html?package=premium"])if(!home.includes(path))throw new Error(`Missing package link: ${path}`);
for(const forbidden of ["hello@example.com","0151 000 0000","[YOUR EMAIL]","PROJECT PHOTO","Example customer"])if((home+order+maintenance+worker).includes(forbidden))throw new Error(`Customer-facing placeholder remains: ${forbidden}`);
for(const marker of ["/api/checkout","/api/maintenance-request","/api/stripe-webhook","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","request_type","stripeRequest("])if(!worker.includes(marker))throw new Error(`Integration missing: ${marker}`);
if(!home.includes('href="maintenance.html"'))throw new Error("Maintenance CTA missing.");
if(!maintenance.includes('id="maintenance-form"'))throw new Error("Maintenance form missing.");
console.log("ProperSite validation passed.");