const PACKAGES = {
  starter: { name: "ProperSite Starter", amount: 5000, description: "One-page website for a local business." },
  business: { name: "ProperSite Business", amount: 10000, description: "Fuller business website for a local business." },
  premium: { name: "ProperSite Premium", amount: 15000, description: "Premium visual website for a local business." }
};
const FIELDS = [["name",120],["business",160],["email",254],["phone",40],["goal",1200],["pages",1200],["services",1600],["content",1600],["style",1200],["assets",1200],["examples",1200],["domain",500],["requirements",2400]];
const MAINTENANCE_FIELDS = [["name",120],["business",160],["email",254],["website",500],["request",3000],["urgency",20]];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8"}});
function clean(value,max){return String(value??"").trim().slice(0,max)}
function validEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)}
function chunkMetadataValue(value,maxChunks=4){return (value.match(/.{1,450}/gs)||[""]).slice(0,maxChunks)}
function buildMetadata(order){
  const metadata={order_version:"1",package:order.package,customer_name:clean(order.name,120),business_name:clean(order.business,160),customer_email:clean(order.email,254)};
  let index=0;
  for(const [field,max] of FIELDS){
    if(["name","business","email"].includes(field))continue;
    const value=clean(order[field],max);if(!value)continue;
    for(const chunk of chunkMetadataValue(value)){if(index>=42)break;metadata[`brief_${String(index+1).padStart(2,"0")}_${field}`]=chunk;index++}
  }
  return metadata
}
function buildMaintenanceMetadata(order){
  const metadata={request_type:"maintenance",request_version:"1",customer_name:clean(order.name,120),business_name:clean(order.business,160),customer_email:clean(order.email,254),website:clean(order.website,500),urgency:clean(order.urgency,20)};
  let index=0;
  for(const chunk of chunkMetadataValue(clean(order.request,3000),7)){metadata[`request_${String(index+1).padStart(2,"0")}`]=chunk;index++}
  return metadata
}
function addMetadata(body,metadata){for(const [key,value] of Object.entries(metadata))body.append(`metadata[${key}]`,value)}
async function stripeRequest(path,env,body){
  return fetch(`https://api.stripe.com/v1/${path}`,{method:"POST",headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,"Content-Type":"application/x-www-form-urlencoded"},body});
}
async function createCheckout(request,env){
  if(!env.STRIPE_SECRET_KEY)return json({error:"Payments are not configured yet. Please try again shortly."},503);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  let input;try{input=await request.json()}catch{return json({error:"Invalid order details."},400)}
  const packageKey=clean(input.package,20),product=PACKAGES[packageKey];
  if(!product)return json({error:"Please choose a valid package."},400);
  const order=Object.fromEntries(FIELDS.map(([field,max])=>[field,clean(input[field],max)]));order.package=packageKey;
  if(!order.name||!order.business||!order.email||!order.goal)return json({error:"Please complete your name, business, email and website goal."},400);
  if(!validEmail(order.email))return json({error:"Please enter a valid email address."},400);
  const origin=new URL(request.url).origin,params=new URLSearchParams();
  params.append("mode","payment");params.append("success_url",`${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`);params.append("cancel_url",`${origin}/cancel.html`);params.append("customer_email",order.email);
  params.append("line_items[0][price_data][currency]","gbp");params.append("line_items[0][price_data][unit_amount]",String(product.amount));params.append("line_items[0][price_data][product_data][name]",product.name);params.append("line_items[0][price_data][product_data][description]",product.description);params.append("line_items[0][quantity]","1");
  params.append("client_reference_id",`propersite-${crypto.randomUUID()}`);addMetadata(params,buildMetadata(order));
  const stripeResponse=await stripeRequest("checkout/sessions",env,params),stripeResult=await stripeResponse.json();
  if(!stripeResponse.ok||!stripeResult.url)return json({error:"Stripe could not start checkout. Please try again."},502);
  return json({checkoutUrl:stripeResult.url})
}
async function createMaintenanceRequest(request,env){
  if(!env.STRIPE_SECRET_KEY)return json({error:"Maintenance requests are not configured yet. Please try again shortly."},503);
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  let input;try{input=await request.json()}catch{return json({error:"Invalid maintenance request."},400)}
  const order=Object.fromEntries(MAINTENANCE_FIELDS.map(([field,max])=>[field,clean(input[field],max)]));
  if(!order.name||!order.business||!order.email||!order.request)return json({error:"Please complete your name, business, email and request details."},400);
  if(!validEmail(order.email))return json({error:"Please enter a valid email address."},400);
  const params=new URLSearchParams();
  params.append("name",order.business);params.append("email",order.email);params.append("description",`ProperSite maintenance request from ${order.name} for ${order.business}`);
  addMetadata(params,buildMaintenanceMetadata(order));
  const stripeResponse=await stripeRequest("customers",env,params),stripeResult=await stripeResponse.json();
  if(!stripeResponse.ok||!stripeResult.id)return json({error:"We couldn't securely record the maintenance request. Please try again."},502);
  return json({received:true,reference:stripeResult.id},202)
}
function timingSafeEqual(a,b){if(a.length!==b.length)return false;let result=0;for(let i=0;i<a.length;i++)result|=a.charCodeAt(i)^b.charCodeAt(i);return result===0}
function hex(buffer){return[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
async function verifyStripeSignature(payload,signature,secret){
  if(!signature||!secret)return false;
  const parts=signature.split(","),timestamp=parts.find(part=>part.startsWith("t="))?.slice(2),signatures=parts.filter(part=>part.startsWith("v1=")).map(part=>part.slice(3));
  if(!timestamp||signatures.length===0)return false;
  const timestampNumber=Number(timestamp);if(!Number.isFinite(timestampNumber)||Math.abs(Date.now()/1000-timestampNumber)>300)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signed=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${timestamp}.${payload}`)),expected=hex(signed);
  return signatures.some(candidate=>timingSafeEqual(candidate,expected))
}
async function handleWebhook(request,env){
  if(request.method!=="POST")return json({error:"Method not allowed."},405);
  if(!env.STRIPE_WEBHOOK_SECRET)return json({error:"Webhook not configured."},503);
  const payload=await request.text();
  if(!(await verifyStripeSignature(payload,request.headers.get("stripe-signature"),env.STRIPE_WEBHOOK_SECRET)))return json({error:"Invalid webhook signature."},400);
  let event;try{event=JSON.parse(payload)}catch{return json({error:"Invalid webhook payload."},400)}
  if(event.type==="checkout.session.completed"){}
  return json({received:true})
}
export default{async fetch(request,env){const url=new URL(request.url);if(url.pathname==="/api/checkout")return createCheckout(request,env);if(url.pathname==="/api/maintenance-request")return createMaintenanceRequest(request,env);if(url.pathname==="/api/stripe-webhook")return handleWebhook(request,env);return env.ASSETS.fetch(request)}};