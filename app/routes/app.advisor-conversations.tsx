import * as React from "react";
import type {LoaderFunctionArgs,ActionFunctionArgs} from "react-router";
import {useLoaderData,useFetcher,Link,useSearchParams} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}:LoaderFunctionArgs){
 const {session}=await authenticate.admin(request);
 const url=new URL(request.url);
 const selected=url.searchParams.get("conversation")||"";
 const search=(url.searchParams.get("q")||"").trim().slice(0,100);
 const notesOnly=url.searchParams.get("notes")==="1";
 const page=Math.max(1,Math.min(100,Number(url.searchParams.get("page")||"1")||1));
 const conversations=await prisma.advisorConversation.findMany({
  where:{shop:session.shop,...(notesOnly?{feedback:{some:{}}}:{}),...(search?{OR:[{customerId:{contains:search}},{messages:{some:{content:{contains:search,mode:"insensitive" as const}}}}]}:{})},orderBy:{updatedAt:"desc"},take:25,skip:(page-1)*25,
  select:{id:true,createdAt:true,updatedAt:true,visitorId:true,customerId:true,
   messages:{orderBy:{createdAt:"desc"},take:1,select:{content:true,role:true}},
   _count:{select:{messages:true,feedback:true}}}
 });
 const total=await prisma.advisorConversation.count({where:{shop:session.shop,...(notesOnly?{feedback:{some:{}}}:{}),...(search?{OR:[{customerId:{contains:search}},{messages:{some:{content:{contains:search,mode:"insensitive" as const}}}}]}:{})}});
 const feedbackCount=await prisma.advisorFeedback.count({where:{conversation:{shop:session.shop}}});
 const latestFeedback=await prisma.advisorFeedback.findMany({where:{conversation:{shop:session.shop}},orderBy:{createdAt:"desc"},take:100,select:{id:true,conversationId:true,rating:true,note:true,createdAt:true,staffId:true,conversation:{select:{customerId:true,updatedAt:true}}}});
 const customerIds=Array.from(new Set(conversations.map(c=>c.customerId).concat(latestFeedback.map(f=>f.conversation.customerId)).filter((id):id is string=>Boolean(id)))).slice(0,100);
 const customerDirectory:Record<string,{name:string;email:string|null}>={};
 if(customerIds.length){
  try{
   const {admin}=await authenticate.admin(request);
   const result=await admin.graphql("query AdvisorNames($ids:[ID!]!){nodes(ids:$ids){... on Customer{id firstName lastName email}}}",{variables:{ids:customerIds.map(id=>"gid://shopify/Customer/"+id)}});
   const payload:any=await result.json();
   for(const customer of payload.data?.nodes||[]){
    const id=String(customer?.id||"").split("/").pop();
    if(id&&customerIds.includes(id)){
     const name=[customer.firstName,customer.lastName].filter(Boolean).join(" ").trim();
     customerDirectory[id]={name:name||"Cliente Shopify",email:customer.email||null};
    }
   }
  }catch(error){console.warn("[ADVISOR CONSOLE] Shopify identity lookup unavailable",error instanceof Error?error.name:"Unknown");}
 }
 const detail=selected?await prisma.advisorConversation.findFirst({
  where:{id:selected,shop:session.shop},
  include:{messages:{orderBy:{createdAt:"asc"},take:200},feedback:{orderBy:{createdAt:"desc"},take:50}}
 }):null;
 return {conversations,detail,total,page,search,shop:session.shop,notesOnly,feedbackCount,latestFeedback,customerDirectory};
}

export async function action({request}:ActionFunctionArgs){
 const {session}=await authenticate.admin(request);
 const form=await request.formData();
 const conversationId=String(form.get("conversationId")||"");
 const rating=String(form.get("rating")||"");
 const note=String(form.get("note")||"").trim();
 if(!["useful","needs_review","incorrect"].includes(rating)||note.length>2000)return {ok:false};
 const conversation=await prisma.advisorConversation.findFirst({where:{id:conversationId,shop:session.shop}});
 if(!conversation)return {ok:false};
 await prisma.advisorFeedback.create({data:{conversationId,staffId:String(session.userId||"staff"),rating,note}});
 return {ok:true};
}

export default function AdvisorConsole(){
 const {conversations,detail,total,page,search,shop,notesOnly,feedbackCount,latestFeedback,customerDirectory}=useLoaderData<typeof loader>();
 const feedback=useFetcher<typeof action>();
 const [params,setParams]=useSearchParams();
 const [expanded,setExpanded]=React.useState(false);
 const [feedbackPanel,setFeedbackPanel]=React.useState(false);
 const [query,setQuery]=React.useState(search);

 const navigate=(id:string)=>{const next=new URLSearchParams(params);next.set("conversation",id);setParams(next);setFeedbackPanel(false)};
 const showNotes=()=>{const next=new URLSearchParams(params);next.delete("conversation");next.delete("page");if(notesOnly)next.delete("notes");else next.set("notes","1");setParams(next);setExpanded(true);setFeedbackPanel(false)};
 const format=(d:string|Date)=>new Date(d).toLocaleString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
 const box={border:"1px solid #e5e5e5",borderRadius:12,background:"#fff"} as const;
 const accent="#f47721";
 const customerName=(id:string|null)=>id?(customerDirectory[id]?.name||"Cliente Shopify"):"Visitatore anonimo";
 const customerMeta=(id:string|null)=>id?"ID Shopify · "+id+(customerDirectory[id]?.email?" · "+customerDirectory[id].email:""):"";
 const ratingLabel=(r:string)=>r==="useful"?"Risposta utile":r==="incorrect"?"Risposta errata":"Da migliorare";
 return <s-page heading="Running Advisor · Console">
  <s-section>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}>
    {[["Conversazioni",total],["Ultime 5",Math.min(total,5)],["Feedback registrati",feedbackCount]].map(([label,value])=><div key={String(label)} style={{...box,padding:"14px 20px",minWidth:150,flex:"1 1 140px"}}><div style={{fontSize:12,color:"#6b7280"}}>{label}</div><div style={{fontSize:27,fontWeight:750}}>{value}</div></div>)}
   </div>
   <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
    <button type="button" onClick={()=>{setFeedbackPanel(!feedbackPanel);setExpanded(true)}} style={{padding:"12px 18px",borderRadius:9,border:"1px solid "+accent,background:feedbackPanel?accent:"#fff",color:feedbackPanel?"white":"#202020",fontSize:14,fontWeight:750,cursor:"pointer"}}>📝 Apri registro di tutti i feedback ({feedbackCount}) {feedbackPanel?"▴":"▾"}</button>
    <button type="button" onClick={showNotes} style={{padding:"12px 18px",borderRadius:9,border:"1px solid #d1d5db",background:notesOnly?"#fff0e6":"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>{notesOnly?"✓ Solo chat con note — disattiva":"Mostra soltanto chat con note"}</button>
   </div>
   {feedbackPanel&&<div style={{...box,padding:18,marginBottom:18,borderTop:"3px solid "+accent}}>
    <h2 style={{margin:"0 0 5px",fontSize:19}}>Registro feedback dello staff</h2>
    <p style={{margin:"0 0 14px",color:"#555",fontSize:14}}>Tutte le ultime 100 valutazioni. Premi «Apri conversazione» per leggere il contesto.</p>
    <div style={{maxHeight:380,overflowY:"auto"}}>
     {latestFeedback.map(item=><div key={item.id} style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"13px 4px",borderBottom:"1px solid #ececec",flexWrap:"wrap"}}>
      <div style={{flex:"1 1 300px"}}><div style={{fontSize:13,fontWeight:750}}>{ratingLabel(item.rating)} · {customerName(item.conversation.customerId)}</div>
      <div style={{fontSize:14,marginTop:5,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.note||"Nessuna nota testuale"}</div><div style={{fontSize:12,color:"#666",marginTop:5}}>{format(item.createdAt)}</div></div>
      <button type="button" onClick={()=>navigate(item.conversationId)} style={{padding:"10px 14px",borderRadius:8,border:"1px solid "+accent,background:"#fff",fontWeight:750,cursor:"pointer",color:"#202020"}}>Apri conversazione →</button>
     </div>)}
     {!latestFeedback.length&&<p>Non ci sono ancora feedback registrati.</p>}
    </div>
   </div>}
   <div style={{display:"grid",gridTemplateColumns:"minmax(260px,360px) minmax(0,1fr)",gap:16,alignItems:"start"}}>
    <aside style={{...box,overflow:"hidden"}}>
     <div style={{padding:16,borderBottom:"1px solid #e3e7ec"}}>
      <strong style={{fontSize:17}}>Conversazioni</strong><div style={{fontSize:13,color:"#555",marginTop:5}}>Premi su una chat per aprire e leggere tutti i messaggi.</div>
      <form method="get" style={{display:"flex",gap:6,marginTop:12}}>
       <input type="hidden" name="notes" value={notesOnly?"1":"0"}/><input name="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca messaggi o ID cliente" style={{width:"100%",minWidth:0,padding:9,border:"1px solid #d1d5db",borderRadius:8}}/>
       <button type="submit" style={{padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:8,cursor:"pointer"}}>Cerca</button>
      </form>
      <button type="button" onClick={()=>setExpanded(!expanded)} style={{marginTop:12,width:"100%",padding:10,border:"1px solid #d1d5db",borderRadius:8,cursor:"pointer",textAlign:"left",background:"#f8fafc",fontWeight:600}}>{expanded?"▾ Nascondi archivio":"▸ Mostra tutto lo storico"} ({total})</button>
     </div>
     <div style={{padding:"12px 16px 4px",fontSize:12,fontWeight:700,color:"#6b7280"}}>{expanded?"ARCHIVIO":"ULTIME 5"}</div>
     <div style={{maxHeight:expanded?640:430,overflowY:"auto"}}>
      {(expanded?conversations:conversations.slice(0,5)).map((c,i)=><button type="button" key={c.id} onClick={()=>navigate(c.id)} style={{display:"block",width:"100%",textAlign:"left",padding:"14px 16px",border:0,borderBottom:"1px solid #eef0f3",background:detail?.id===c.id?"#fff1e7":"white",cursor:"pointer",borderLeft:detail?.id===c.id?"4px solid "+accent:"4px solid transparent"}}>
       <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12}}><strong>{customerName(c.customerId)}</strong><span style={{color:"#6b7280",whiteSpace:"nowrap"}}>{format(c.updatedAt)}</span></div>
       {c.customerId&&<div style={{fontSize:11,color:"#64748b",marginTop:4,overflowWrap:"anywhere"}}>{customerMeta(c.customerId)}</div>}<div style={{fontSize:13,color:"#475569",marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.messages[0]?.content||"Nuova conversazione"}</div>
       <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:"#555"}}>{c._count.messages} messaggi {c._count.feedback>0&&<strong style={{color:"#a34708",background:"#fff0e5",padding:"4px 7px",borderRadius:6,marginLeft:5}}>📝 {c._count.feedback} note staff</strong>}</span>
        <span style={{fontSize:13,fontWeight:800,color:"#b94c08",whiteSpace:"nowrap"}}>Apri chat →</span>
       </div>
      </button>)}
      {!conversations.length&&<p style={{padding:16}}>Nessuna conversazione trovata.</p>}
     </div>
     {expanded&&<div style={{padding:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      {page>1?<Link to={`?q=${encodeURIComponent(search)}&page=${page-1}${notesOnly?"&notes=1":""}`}>← Precedenti</Link>:<span/>}
      <small>Pagina {page} di {Math.max(1,Math.ceil(total/25))}</small>
      {page*25<total?<Link to={`?q=${encodeURIComponent(search)}&page=${page+1}${notesOnly?"&notes=1":""}`}>Successive →</Link>:<span/>}
     </div>}
    </aside>
    <article style={{...box,padding:20,minHeight:500}}>
     {!detail?<div style={{textAlign:"center",padding:"90px 20px",color:"#64748b"}}><div style={{fontSize:38}}>◌</div><h3>Seleziona una conversazione</h3><p>Leggi lo scambio completo e lascia un feedback per migliorare l'Advisor.</p></div>:<>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderBottom:"1px solid #e3e7ec",paddingBottom:16,marginBottom:18}}>
       <div><div style={{fontSize:12,color:"#64748b"}}>CONVERSAZIONE · {format(detail.createdAt)}</div><h2 style={{margin:"6px 0"}}>{customerName(detail.customerId)}</h2>{detail.customerId&&<div style={{fontSize:12,color:"#64748b",marginBottom:5}}>{customerMeta(detail.customerId)}</div>}<small>{detail.messages.length} messaggi · ID sessione {detail.visitorId.slice(0,8)}</small></div>
       {detail.customerId&&<a href={`https://admin.shopify.com/store/${shop.replace(".myshopify.com","")}/customers/${detail.customerId}`} target="_blank" rel="noopener noreferrer" style={{alignSelf:"center",padding:"10px 14px",borderRadius:9,background:"#111827",color:"#fff",textDecoration:"none"}}>Apri cliente Shopify ↗</a>}
      </div>
      <div style={{maxHeight:530,overflowY:"auto",padding:"4px 6px 12px"}}>
       {detail.messages.map(m=><div key={m.id} style={{maxWidth:"87%",marginBottom:12,marginLeft:m.role==="user"?"auto":0,padding:"12px 15px",borderRadius:14,background:m.role==="user"?"#e8efff":"#f2f4f7",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#475569",marginBottom:6}}>{m.role==="user"?"CLIENTE":"RUNNING ADVISOR"} · {format(m.createdAt)}</div><div style={{fontSize:14,lineHeight:1.5}}>{m.content}</div>
       </div>)}
      </div>
      <div style={{borderTop:"1px solid #e3e7ec",paddingTop:18}}>
       <h3 style={{marginTop:0}}>Feedback dello staff</h3>
       <feedback.Form method="post">
        <input type="hidden" name="conversationId" value={detail.id}/>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
         <select name="rating" required defaultValue="needs_review" style={{padding:10,border:"1px solid #d1d5db",borderRadius:8}}><option value="useful">✓ Risposta utile</option><option value="needs_review">◷ Da migliorare</option><option value="incorrect">✕ Risposta errata</option></select>
         <button type="submit" disabled={feedback.state!=="idle"} style={{padding:"10px 18px",background:"#111827",color:"white",border:0,borderRadius:8,cursor:"pointer"}}>Salva feedback</button>
        </div>
        <textarea name="note" maxLength={2000} rows={3} placeholder="Cosa ha funzionato? Cosa dovrebbe migliorare?" style={{width:"100%",boxSizing:"border-box",marginTop:10,padding:12,border:"1px solid #d1d5db",borderRadius:8}}/>
        {feedback.data?.ok&&<p style={{color:"#166534"}}>Feedback salvato.</p>}
       </feedback.Form>
       {detail.feedback.map(item=><div key={item.id} style={{padding:12,background:"#f8fafc",borderRadius:9,marginTop:10}}><strong>{item.rating}</strong> · {item.note}<div style={{fontSize:11,color:"#64748b"}}>{format(item.createdAt)}</div></div>)}
      </div>
     </>}
    </article>
   </div>
   <p style={{fontSize:12,color:"#64748b",marginTop:14}}>Il collegamento al cliente compare soltanto quando Shopify conferma l'identità. Carrello, checkout e acquisto non sono ancora tracciati: non vengono dedotti dalle chat.</p>
  </s-section>
 </s-page>;
}
