const PACKAGES={
  starter:{name:"ProperSite Starter",amount:5000,description:"One-page website for a local business."},
  business:{name:"ProperSite Business",amount:10000,description:"Fuller business website for a local business."},
  premium:{name:"ProperSite Premium",amount:15000,description:"Premium visual website for a local business."}
};
const ORDER_FIELDS=[["name",120],["business",160],["email",254],["phone",40],["goal",1200],["pages",1200],["services",1600],["content",1600],["style",1200],["assets",1200],["examples",1200],["domain",500],["domain_status",20],["requirements",2400]];
const MAINTENANCE_FIELDS=[["name",120],["business",160],["email",254],["website",500],["request",3000],["urgency",20]];
const SESSION_DAYS=30;
const encoder=new TextEncoder();

const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8",...headers}});
const clean=(value,max)=>String(value??"").trim().slice(0,max);
const validEmail=email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validPassword=password=>typeof password==="string"&&password.length>=10&&password.length<=128;
const now=()=>Math.floor(Date.now()/1000);
const id=()=>crypto.randomUUID();
const bytesToBase64=bytes=>{let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary)};
const base64ToBytes=value=>Uint8Array.from(atob(value),char=>char.charCodeAt(0));
const randomToken=()=>{const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(byte=>byte.toString(16).padStart(2,"0")).join("")};
const hashToken=async token=>{const digest=await crypto.subtle.digest("SHA-256",encoder.encode(token));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("")};

async function hashPassword(password){
  const salt=new Uint8Array(16);crypto.getRandomValues(salt);
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:120000,hash:"SHA-256"},key,256);
  return "pbkdf2$120000$"+bytesToBase64(salt)+"$"+bytesToBase64(new Uint8Array(bits));
}
async function verifyPassword(password,stored){
  const [scheme,iterations,saltEncoded,hashEncoded]=String(stored||"").split("$");
  if(scheme!=="pbkdf2"||Number(iterations)!==120000||!saltEncoded||!hashEncoded)return false;
  const key=await crypto.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:base64ToBytes(saltEncoded),iterations:120000,hash:"SHA-256"},key,256);
  const actual=new Uint8Array(bits),expected=base64ToBytes(hashEncoded);
  return actual.length===expected.length&&crypto.subtle.timingSafeEqual(actual,expected);
}
function cookie(name,value,attributes=""){return name+"="+encodeURIComponent(value)+"; "+attributes}
function sessionCookie(token){return cookie("ps_session",token,"Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age="+SESSION_DAYS*86400)}
function clearSessionCookie(){return cookie("ps_session","","Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0")}
function getCookie(request,name){const header=request.headers.get("Cookie")||"";for(const part of header.split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="))}return null}
function sameOrigin(request){
  const url=new URL(request.url);
  const origin=request.headers.get("Origin");
  return !origin||origin===url.origin;
}
function requireDatabase(env){if(!env.DB)throw new Error("D1 database binding DB is not configured.")}

async function currentUser(request,env){
  if(!env.DB)return null;
  const token=getCookie(request,"ps_session");if(!token)return null;
  const tokenHash=await hashToken(token);
  const row=await env.DB.prepare("SELECT u.id,u.email,u.name,u.business,u.role,u.created_at,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(tokenHash,now()).first();
  return row||null;
}
async function createSession(userId,env){
  const token=randomToken(),tokenHash=await hashToken(token),expires=now()+SESSION_DAYS*86400;
  await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)").bind(tokenHash,userId,expires,now()).run();
  return token;
}
async function deleteSession(request,env){
  const token=getCookie(request,"ps_session");if(!token)return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await hashToken(token)).run();
}
function authRequired(user){return user?null:json({error:"Please sign in to continue."},401)}
async function parseJson(request,message){try{return await request.json()}catch{return null}}

async function register(request,env){
  requireDatabase(env);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!sameOrigin(request))return json({error:"Invalid request origin."},403);
  const input=await parseJson(request);if(!input)return json({error:"Invalid account details."},400);
  const name=clean(input.name,120),business=clean(input.business,160),email=clean(input.email,254).toLowerCase(),password=String(input.password||"");
  if(!name||!email||!validEmail(email)||!validPassword(password))return json({error:"Use your name, a valid email and a password of at least 10 characters."},400);
  const exists=await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
  if(exists)return json({error:"An account already exists for that email. Sign in instead."},409);
  const userId=id(),passwordHash=await hashPassword(password),timestamp=now();
  await env.DB.prepare("INSERT INTO users(id,email,password_hash,name,business,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(userId,email,passwordHash,name,business,"customer",timestamp,timestamp).run();
  const token=await createSession(userId,env);
  return json({user:{id:userId,email,name,business,role:"customer"}},201,{"set-cookie":sessionCookie(token)});
}
async function login(request,env){
  requireDatabase(env);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!sameOrigin(request))return json({error:"Invalid request origin."},403);
  const input=await parseJson(request);if(!input)return json({error:"Invalid login details."},400);
  const email=clean(input.email,254).toLowerCase(),password=String(input.password||"");
  const user=await env.DB.prepare("SELECT id,email,password_hash,name,business,role FROM users WHERE email=?").bind(email).first();
  if(!user||!(await verifyPassword(password,user.password_hash)))return json({error:"Email or password is incorrect."},401);
  const token=await createSession(user.id,env);
  return json({user:{id:user.id,email:user.email,name:user.name,business:user.business,role:user.role}},200,{"set-cookie":sessionCookie(token)});
}
async function logout(request,env){
  requireDatabase(env);if(request.method!=="POST")return json({error:"Method not allowed."},405);if(!sameOrigin(request))return json({error:"Invalid request origin."},403);
  await deleteSession(request,env);return json({ok:true},200,{"set-cookie":clearSessionCookie()});
}
async function me(request,env){
  const user=await currentUser(request,env);return json({authenticated:!!user,user:user?{id:user.id,email:user.email,name:user.name,business:user.business,role:user.role}:null});
}

function buildMetadata(order){
  const metadata={order_version:"2",package:order.package,customer_name:clean(order.name,120),business_name:clean(order.business,160),customer_email:clean(order.email,254)};
  let index=0;
  for(const [field,max] of ORDER_FIELDS){
    if(["name","business","email"].includes(field))continue;
    const value=clean(order[field],max);if(!value)continue;
    for(const chunk of (value.match(/.{1,450}/gs)||[""])){if(index>=42)break;metadata["brief_"+String(++index).padStart(2,"0")+"_"+field]=chunk}
  }
  return metadata;
}
function addMetadata(body,metadata){for(const [key,value] of Object.entries(metadata))body.append("metadata["+key+"]",value)}
async function stripeRequest(path,env,body){
  return fetch("https://api.stripe.com/v1/"+path,{method:"POST",headers:{Authorization:"Bearer "+env.STRIPE_SECRET_KEY,"Content-Type":"application/x-www-form-urlencoded"},body});
}

async function ensureCheckoutUser(order,input,request,env){
  const sessionUser=await currentUser(request,env);
  if(sessionUser){
    if(sessionUser.email!==order.email)return {error:json({error:"The order email must match your signed-in account."},400)};
    return {user:sessionUser,sessionToken:null};
  }
  const password=String(input.account_password||"");
  if(!validPassword(password))return {error:json({error:"Create your customer account with a password of at least 10 characters before paying."},400)};
  const existing=await env.DB.prepare("SELECT id,email,password_hash,name,business,role FROM users WHERE email=?").bind(order.email).first();
  if(existing){
    if(!(await verifyPassword(password,existing.password_hash)))return {error:json({error:"An account already exists for this email. Use the correct account password."},409)};
    const token=await createSession(existing.id,env);
    return {user:existing,sessionToken:token};
  }
  const userId=id(),passwordHash=await hashPassword(password),timestamp=now();
  await env.DB.prepare("INSERT INTO users(id,email,password_hash,name,business,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(userId,order.email,passwordHash,order.name,order.business,"customer",timestamp,timestamp).run();
  const token=await createSession(userId,env);
  return {user:{id:userId,email:order.email,name:order.name,business:order.business,role:"customer"},sessionToken:token};
}

async function createCheckout(request,env){
  requireDatabase(env);
  if(!env.STRIPE_SECRET_KEY)return json({error:"Payments are not configured yet. Please try again shortly."},503);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!sameOrigin(request))return json({error:"Invalid request origin."},403);
  const input=await parseJson(request);if(!input)return json({error:"Invalid order details."},400);
  const packageKey=clean(input.package,20),product=PACKAGES[packageKey];
  if(!product)return json({error:"Please choose a valid package."},400);
  const order=Object.fromEntries(ORDER_FIELDS.map(([field,max])=>[field,clean(input[field],max)]));order.package=packageKey;order.email=order.email.toLowerCase();
  if(!order.name||!order.business||!order.email||!order.goal)return json({error:"Please complete your name, business, email and website goal."},400);
  if(!validEmail(order.email))return json({error:"Please enter a valid email address."},400);
  const account=await ensureCheckoutUser(order,input,request,env);if(account.error)return account.error;
  const orderId=id(),timestamp=now(),brief=JSON.stringify(order),origin=new URL(request.url).origin;
  await env.DB.prepare("INSERT INTO orders(id,user_id,package,amount,currency,status,customer_name,business_name,email,brief_json,domain_status,domain,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(orderId,account.user.id,packageKey,product.amount,"gbp","pending",order.name,order.business,order.email,brief,order.domain_status,order.domain,timestamp).run();
  const params=new URLSearchParams();
  params.append("mode","payment");params.append("success_url",origin+"/success.html?session_id={CHECKOUT_SESSION_ID}");params.append("cancel_url",origin+"/cancel.html");params.append("customer_email",order.email);
  params.append("line_items[0][price_data][currency]","gbp");params.append("line_items[0][price_data][unit_amount]",String(product.amount));params.append("line_items[0][price_data][product_data][name]",product.name);params.append("line_items[0][price_data][product_data][description]",product.description);params.append("line_items[0][quantity]","1");
  params.append("client_reference_id",orderId);addMetadata(params,{...buildMetadata(order),order_id:orderId,user_id:account.user.id});
  const stripeResponse=await stripeRequest("checkout/sessions",env,params),stripeResult=await stripeResponse.json();
  if(!stripeResponse.ok||!stripeResult.url){await env.DB.prepare("DELETE FROM orders WHERE id=? AND status='pending'").bind(orderId).run();return json({error:"Stripe could not start checkout. Please try again."},502)}
  await env.DB.prepare("UPDATE orders SET stripe_session_id=? WHERE id=?").bind(stripeResult.id,orderId).run();
  const headers=account.sessionToken?{"set-cookie":sessionCookie(account.sessionToken)}:{};
  return json({checkoutUrl:stripeResult.url,orderId},200,headers);
}

async function createMaintenanceRequest(request,env){
  requireDatabase(env);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!sameOrigin(request))return json({error:"Invalid request origin."},403);
  const user=await currentUser(request,env),auth=authRequired(user);if(auth)return auth;
  const input=await parseJson(request);if(!input)return json({error:"Invalid maintenance request."},400);
  const order=Object.fromEntries(MAINTENANCE_FIELDS.map(([field,max])=>[field,clean(input[field],max)]));order.email=order.email.toLowerCase();
  if(!order.name||!order.business||!order.email||!order.request)return json({error:"Please complete your name, business, email and request details."},400);
  if(!validEmail(order.email)||order.email!==user.email)return json({error:"Use the email address on your ProperSite account."},400);
  const website=await env.DB.prepare("SELECT id FROM websites WHERE user_id=? AND (?='' OR id=?) LIMIT 1").bind(user.id,clean(order.website,500),clean(order.website,500)).first();
  const requestId=id();
  await env.DB.prepare("INSERT INTO maintenance_requests(id,user_id,website_id,status,request,urgency,created_at) VALUES(?,?,?,?,?,?,?)").bind(requestId,user.id,website?.id||null,"submitted",clean(order.request,3000),clean(order.urgency,20),now()).run();
  return json({received:true,requestId},202);
}

async function accountDashboard(request,env){
  requireDatabase(env);
  const user=await currentUser(request,env),auth=authRequired(user);if(auth)return auth;
  const orders=(await env.DB.prepare("SELECT id,package,amount,currency,status,customer_name,business_name,domain_status,domain,created_at,paid_at FROM orders WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all()).results;
  const websites=(await env.DB.prepare("SELECT id,order_id,status,domain,live_url,created_at,updated_at FROM websites WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all()).results;
  const maintenance=(await env.DB.prepare("SELECT id,website_id,status,request,urgency,quoted_amount,currency,created_at,quoted_at,paid_at FROM maintenance_requests WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all()).results;
  const payments=(await env.DB.prepare("SELECT id,order_id,maintenance_request_id,amount,currency,status,created_at FROM payments WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all()).results;
  return json({user:{id:user.id,email:user.email,name:user.name,business:user.business,role:user.role},orders,websites,maintenance,payments});
}

async function maintenanceCheckout(request,env,requestId){
  requireDatabase(env);
  if(!env.STRIPE_SECRET_KEY)return json({error:"Payments are not configured yet."},503);
  if(request.method!=="POST"||!sameOrigin(request))return json({error:"Invalid request."},405);
  const user=await currentUser(request,env),auth=authRequired(user);if(auth)return auth;
  const maintenance=await env.DB.prepare("SELECT * FROM maintenance_requests WHERE id=? AND user_id=?").bind(requestId,user.id).first();
  if(!maintenance||maintenance.status!=="quoted"||!Number(maintenance.quoted_amount))return json({error:"This request is not ready for payment."},400);
  const origin=new URL(request.url).origin,params=new URLSearchParams();
  params.append("mode","payment");params.append("success_url",origin+"/account.html?maintenance_paid=1");params.append("cancel_url",origin+"/account.html");
  params.append("customer_email",user.email);params.append("line_items[0][price_data][currency]",maintenance.currency||"gbp");params.append("line_items[0][price_data][unit_amount]",String(maintenance.quoted_amount));params.append("line_items[0][price_data][product_data][name]","ProperSite maintenance");params.append("line_items[0][price_data][product_data][description]","One-off website maintenance work");params.append("line_items[0][quantity]","1");params.append("client_reference_id",requestId);
  addMetadata(params,{payment_type:"maintenance",maintenance_request_id:requestId,user_id:user.id});
  const stripeResponse=await stripeRequest("checkout/sessions",env,params),stripeResult=await stripeResponse.json();
  if(!stripeResponse.ok||!stripeResult.url)return json({error:"Stripe could not start payment."},502);
  await env.DB.prepare("UPDATE maintenance_requests SET stripe_session_id=? WHERE id=? AND user_id=?").bind(stripeResult.id,requestId,user.id).run();
  return json({checkoutUrl:stripeResult.url});
}

async function adminRequired(request,env){
  const user=await currentUser(request,env);
  if(!user||user.role!=="admin")return {response:json({error:"Admin access required."},403)};
  return {user};
}
async function adminDashboard(request,env){
  requireDatabase(env);const check=await adminRequired(request,env);if(check.response)return check.response;
  const customers=(await env.DB.prepare("SELECT id,email,name,business,created_at FROM users WHERE role='customer' ORDER BY created_at DESC").bind().all()).results;
  const orders=(await env.DB.prepare("SELECT o.id,o.user_id,o.package,o.amount,o.currency,o.status,o.business_name,o.email,o.domain_status,o.domain,o.created_at,o.paid_at,w.status AS website_status,w.domain AS website_domain,w.live_url FROM orders o LEFT JOIN websites w ON w.order_id=o.id ORDER BY o.created_at DESC").bind().all()).results;
  const maintenance=(await env.DB.prepare("SELECT m.id,m.user_id,m.status,m.request,m.urgency,m.quoted_amount,m.currency,m.created_at,m.quoted_at,m.paid_at,u.email,u.business FROM maintenance_requests m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC").bind().all()).results;
  return json({customers,orders,maintenance});
}
async function adminQuote(request,env,requestId){
  requireDatabase(env);const check=await adminRequired(request,env);if(check.response)return check.response;
  if(request.method!=="POST"||!sameOrigin(request))return json({error:"Invalid request."},405);
  const input=await parseJson(request);const amount=Number(input?.amount);
  if(!Number.isInteger(amount)||amount<100||amount>1000000)return json({error:"Enter a valid maintenance amount in pence."},400);
  const result=await env.DB.prepare("UPDATE maintenance_requests SET quoted_amount=?,currency='gbp',status='quoted',quoted_at=? WHERE id=?").bind(amount,now(),requestId).run();
  if(!result.meta.changes)return json({error:"Maintenance request not found."},404);
  return json({ok:true});
}
async function adminWebsite(request,env,websiteId){
  requireDatabase(env);const check=await adminRequired(request,env);if(check.response)return check.response;
  if(request.method!=="POST"||!sameOrigin(request))return json({error:"Invalid request."},405);
  const input=await parseJson(request);if(!input)return json({error:"Invalid website update."},400);
  const status=clean(input.status,40),domain=clean(input.domain,500),liveUrl=clean(input.live_url,500);
  if(!["onboarding","building","review","live","paused"].includes(status))return json({error:"Invalid website status."},400);
  const result=await env.DB.prepare("UPDATE websites SET status=?,domain=?,live_url=?,updated_at=? WHERE id=?").bind(status,domain,liveUrl,now(),websiteId).run();
  if(!result.meta.changes)return json({error:"Website not found."},404);return json({ok:true});
}

function hex(buffer){return[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
async function verifyStripeSignature(payload,signature,secret){
  if(!signature||!secret)return false;
  const parts=signature.split(","),timestamp=parts.find(part=>part.startsWith("t="))?.slice(2),signatures=parts.filter(part=>part.startsWith("v1=")).map(part=>part.slice(3));
  if(!timestamp||!signatures.length)return false;
  const timestampNumber=Number(timestamp);if(!Number.isFinite(timestampNumber)||Math.abs(Date.now()/1000-timestampNumber)>300)return false;
  const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected=hex(await crypto.subtle.sign("HMAC",key,encoder.encode(timestamp+"."+payload)));
  const expectedBytes=encoder.encode(expected);
  return signatures.some(candidate=>{const bytes=encoder.encode(candidate);return bytes.length===expectedBytes.length&&crypto.subtle.timingSafeEqual(bytes,expectedBytes)});
}
async function handleWebhook(request,env){
  requireDatabase(env);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!env.STRIPE_WEBHOOK_SECRET)return json({error:"Webhook not configured."},503);
  const payload=await request.text();
  if(!(await verifyStripeSignature(payload,request.headers.get("stripe-signature"),env.STRIPE_WEBHOOK_SECRET)))return json({error:"Invalid webhook signature."},400);
  let event;try{event=JSON.parse(payload)}catch{return json({error:"Invalid webhook payload."},400)}
  if(event.type==="checkout.session.completed"){
    const session=event.data.object,reference=session.client_reference_id;
    if(reference){
      const order=await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(reference).first();
      if(order){
        const timestamp=now();
        await env.DB.batch([
          env.DB.prepare("UPDATE orders SET status='paid',stripe_session_id=?,paid_at=? WHERE id=?").bind(session.id,timestamp,order.id),
          env.DB.prepare("INSERT OR IGNORE INTO payments(id,user_id,order_id,maintenance_request_id,stripe_session_id,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id(),order.user_id,order.id,null,session.id,session.amount_total||order.amount,session.currency||order.currency,"paid",timestamp),
          env.DB.prepare("INSERT OR IGNORE INTO websites(id,order_id,user_id,status,domain,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(id(),order.id,order.user_id,"onboarding",order.domain,timestamp,timestamp)
        ]);
      }else{
        const maintenance=await env.DB.prepare("SELECT * FROM maintenance_requests WHERE id=?").bind(reference).first();
        if(maintenance){
          const timestamp=now();
          await env.DB.batch([
            env.DB.prepare("UPDATE maintenance_requests SET status='paid',paid_at=? WHERE id=?").bind(timestamp,maintenance.id),
            env.DB.prepare("INSERT OR IGNORE INTO payments(id,user_id,order_id,maintenance_request_id,stripe_session_id,amount,currency,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id(),maintenance.user_id,null,maintenance.id,session.id,session.amount_total||maintenance.quoted_amount,session.currency||maintenance.currency,"paid",timestamp)
          ]);
        }
      }
    }
  }
  return json({received:true});
}

export default{async fetch(request,env){
  const url=new URL(request.url);
  try{
    if(url.pathname==="/api/auth/register")return register(request,env);
    if(url.pathname==="/api/auth/login")return login(request,env);
    if(url.pathname==="/api/auth/logout")return logout(request,env);
    if(url.pathname==="/api/auth/me")return me(request,env);
    if(url.pathname==="/api/account/dashboard")return accountDashboard(request,env);
    if(url.pathname==="/api/checkout")return createCheckout(request,env);
    if(url.pathname==="/api/maintenance-request")return createMaintenanceRequest(request,env);
    if(url.pathname.startsWith("/api/maintenance/")&&url.pathname.endsWith("/checkout"))return maintenanceCheckout(request,env,url.pathname.split("/")[3]);
    if(url.pathname==="/api/admin/dashboard")return adminDashboard(request,env);
    if(url.pathname.startsWith("/api/admin/maintenance/")&&url.pathname.endsWith("/quote"))return adminQuote(request,env,url.pathname.split("/")[4]);
    if(url.pathname.startsWith("/api/admin/websites/"))return adminWebsite(request,env,url.pathname.split("/")[4]);
    if(url.pathname==="/api/stripe-webhook")return handleWebhook(request,env);
    return env.ASSETS.fetch(request);
  }catch(error){
    console.error(error);
    return json({error:"Something went wrong. Please try again."},500);
  }
}};