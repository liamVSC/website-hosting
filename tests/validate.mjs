import { readFile } from "node:fs/promises";

const required=["public/index.html","public/order.html","public/order.js","public/order.css","public/maintenance.html","public/maintenance.css","public/maintenance.js","public/success.html","public/cancel.html","public/privacy.html","public/terms.html","public/account.html","public/account.css","public/account.js","public/admin.html","public/admin.js","migrations/0001_accounts.sql","public/favicon.svg","public/site.webmanifest","public/robots.txt","public/404.html","public/_headers","src/index.js","wrangler.jsonc"];
for(const file of required)await readFile(file);
const order=await readFile("public/order.html","utf8");const home=await readFile("public/index.html","utf8");const maintenance=await readFile("public/maintenance.html","utf8");const worker=await readFile("src/index.js","utf8");
for(const pkg of ["starter","business","premium"])if(!order.includes(`value="${pkg}"`))throw new Error(`Missing package option: ${pkg}`);
for(const path of ["order.html?package=starter","order.html?package=business","order.html?package=premium"])if(!home.includes(path))throw new Error(`Missing package link: ${path}`);
for(const forbidden of ["hello@example.com","0151 000 0000","[YOUR EMAIL]","PROJECT PHOTO","Example customer"])if((home+order+maintenance+worker).includes(forbidden))throw new Error(`Customer-facing placeholder remains: ${forbidden}`);
for(const marker of ["/api/auth/register","/api/auth/login","/api/auth/logout","/api/auth/me","/api/account/dashboard","/api/checkout","/api/maintenance-request","/api/maintenance/","/api/admin/dashboard","/api/admin/maintenance/","/api/stripe-webhook","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","pbkdf2$120000","stripeRequest("])if(!worker.includes(marker))throw new Error(`Integration missing: ${marker}`);
if(!home.includes('href="maintenance.html"'))throw new Error("Maintenance CTA missing.");
if(!maintenance.includes('id="maintenance-form"'))throw new Error("Maintenance form missing.");
const account=await readFile("public/account.html","utf8");const admin=await readFile("public/admin.html","utf8");const schema=await readFile("migrations/0001_accounts.sql","utf8");
for(const marker of ["auth-form","dashboard-view","api/auth/login","api/account/dashboard"])if(!account.includes(marker))throw new Error(`Account UI missing: ${marker}`);
for(const marker of ["api/admin/dashboard","api/admin/maintenance/"])if(!admin.includes(marker)||!worker.includes(marker))throw new Error(`Admin integration missing: ${marker}`);
for(const marker of ["CREATE TABLE IF NOT EXISTS users","CREATE TABLE IF NOT EXISTS orders","CREATE TABLE IF NOT EXISTS websites","CREATE TABLE IF NOT EXISTS maintenance_requests","CREATE TABLE IF NOT EXISTS payments"])if(!schema.includes(marker))throw new Error(`D1 schema missing: ${marker}`);
console.log("ProperSite validation passed.");