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
 const page=Math.max(1,Math.min(100,Number(url.searchParams.get("page")||"1")||1));
 const conversations=await prisma.advisorConversation.findMany({
  where:{shop:session.shop,...(search?{OR:[{customerId:{contains:search}},{messages:{some:{content:{contains:search,mode:"insensitive" as const}}}}]}:{})},orderBy:{updatedAt:"desc"},take:25,skip:(page-1)*25,
  select:{id:true,createdAt:true,updatedAt:true,visitorId:true,customerId:true,
   messages:{orderBy:{createdAt:"desc"},take:1,select:{content:true,role:true}},
   _count:{select:{messages:true,feedback:true}}}
 });
 const total=await prisma.advisorConversation.count({where:{shop:session.shop,...(search?{OR:[{customerId:{contains:search}},{messages:{some:{content:{contains:search,mode:"insensitive" as const}}}}]}:{})}});
 const detail=selected?await prisma.advisorConversation.findFirst({
  where:{id:selected,shop:session.shop},
  include:{messages:{orderBy:{createdAt:"asc"},take:200},feedback:{orderBy:{createdAt:"desc"},take:50}}
 }):null;
 return {conversations,detail,total,page,search,shop:session.shop};
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
 const {conversations,detail,total,page,search,shop}=useLoaderData<typeof loader>();
 const feedback=useFetcher<typeof action>();
 const [params,setParams]=useSearchParams();
 const [expanded,setExpanded]=React.useState(false);
 const [query,setQuery]=React.useState(search);
 const current=conversations.find(c=>c.id===detail?.id);
 const navigate=(id:string)=>{const next=new URLSearchParams(params);next.set("conversation",id);setParams(next)};
 const format=(d:string|Date)=>new Date(d).toLocaleString("it-IT",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
 const box={border:"1px solid #e3e7ec",borderRadius:14,background:"#fff"} as const;
 return <s-page heading="Running Advisor · Console">
  <s-section>
   <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:18}}>
    {[["Conversazioni",total],["Ultime 5",Math.min(total,5)],["Feedback",conversations.reduce((a,c)=>a+c._count.feedback,0)]].map(([label,value])=><div key={String(label)} style={{...box,padding:"14px 20px",minWidth:150,flex:"1 1 140px"}}><div style={{fontSize:12,color:"#6b7280"}}>{label}</div><div style={{fontSize:27,fontWeight:750}}>{value}</div></div>)}
   </div>
   <div style={{display:"grid",gridTemplateColumns:"minmax(260px,360px) minmax(0,1fr)",gap:16,alignItems:"start"}}>
    <aside style={{...box,overflow:"hidden"}}>
     <div style={{padding:16,borderBottom:"1px solid #e3e7ec"}}>
      <strong>Conversazioni</strong>
      <form method="get" style={{display:"flex",gap:6,marginTop:12}}>
       <input name="q" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cerca messaggi o ID cliente" style={{width:"100%",minWidth:0,padding:9,border:"1px solid #d1d5db",borderRadius:8}}/>
       <button type="submit" style={{padding:"8px 12px",border:"1px solid #d1d5db",borderRadius:8,cursor:"pointer"}}>Cerca</button>
      </form>
      <button type="button" onClick={()=>setExpanded(!expanded)} style={{marginTop:12,width:"100%",padding:10,border:"1px solid #d1d5db",borderRadius:8,cursor:"pointer",textAlign:"left",background:"#f8fafc",fontWeight:600}}>{expanded?"▾ Nascondi archivio":"▸ Mostra tutto lo storico"} ({total})</button>
     </div>
     <div style={{padding:"12px 16px 4px",fontSize:12,fontWeight:700,color:"#6b7280"}}>{expanded?"ARCHIVIO":"ULTIME 5"}</div>
     <div style={{maxHeight:expanded?640:430,overflowY:"auto"}}>
      {(expanded?conversations:conversations.slice(0,5)).map((c,i)=><button type="button" key={c.id} onClick={()=>navigate(c.id)} style={{display:"block",width:"100%",textAlign:"left",padding:"14px 16px",border:0,borderBottom:"1px solid #eef0f3",background:detail?.id===c.id?"#eff6ff":"white",cursor:"pointer",borderLeft:detail?.id===c.id?"3px solid #2563eb":"3px solid transparent"}}>
       <div style={{display:"flex",justifyContent:"space-between",gap:8,fontSize:12}}><strong>{c.customerId?"Cliente #"+c.customerId:"Visitatore anonimo"}</strong><span style={{color:"#6b7280",whiteSpace:"nowrap"}}>{format(c.updatedAt)}</span></div>
       <div style={{fontSize:13,color:"#475569",marginTop:6,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.messages[0]?.content||"Nuova conversazione"}</div>
       <div style={{fontSize:11,color:"#64748b",marginTop:6}}>{c._count.messages} messaggi · {c._count.feedback} feedback</div>
      </button>)}
      {!conversations.length&&<p style={{padding:16}}>Nessuna conversazione trovata.</p>}
     </div>
     {expanded&&<div style={{padding:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      {page>1?<Link to={`?q=${encodeURIComponent(search)}&page=${page-1}`}>← Precedenti</Link>:<span/>}
      <small>Pagina {page} di {Math.max(1,Math.ceil(total/25))}</small>
      {page*25<total?<Link to={`?q=${encodeURIComponent(search)}&page=${page+1}`}>Successive →</Link>:<span/>}
     </div>}
    </aside>
    <article style={{...box,padding:20,minHeight:500}}>
     {!detail?<div style={{textAlign:"center",padding:"90px 20px",color:"#64748b"}}><div style={{fontSize:38}}>◌</div><h3>Seleziona una conversazione</h3><p>Leggi lo scambio completo e lascia un feedback per migliorare l'Advisor.</p></div>:<>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap",borderBottom:"1px solid #e3e7ec",paddingBottom:16,marginBottom:18}}>
       <div><div style={{fontSize:12,color:"#64748b"}}>CONVERSAZIONE · {format(detail.createdAt)}</div><h2 style={{margin:"6px 0"}}>{detail.customerId?"Cliente Shopify #"+detail.customerId:"Visitatore anonimo"}</h2><small>{detail.messages.length} messaggi · ID sessione {detail.visitorId.slice(0,8)}</small></div>
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
