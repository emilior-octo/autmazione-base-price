import type {LoaderFunctionArgs,ActionFunctionArgs} from "react-router";
import {useLoaderData,useFetcher,Link} from "react-router";
import {authenticate} from "../shopify.server";
import prisma from "../db.server";

export async function loader({request}:LoaderFunctionArgs){
 const {session}=await authenticate.admin(request);
 const url=new URL(request.url);
 const selected=url.searchParams.get("conversation")||"";
 const conversations=await prisma.advisorConversation.findMany({
  where:{shop:session.shop},orderBy:{updatedAt:"desc"},take:100,
  select:{id:true,createdAt:true,updatedAt:true,visitorId:true,
   messages:{orderBy:{createdAt:"desc"},take:1,select:{content:true,role:true}},
   _count:{select:{messages:true,feedback:true}}}
 });
 const detail=selected?await prisma.advisorConversation.findFirst({
  where:{id:selected,shop:session.shop},
  include:{messages:{orderBy:{createdAt:"asc"},take:200},feedback:{orderBy:{createdAt:"desc"},take:50}}
 }):null;
 return {conversations,detail};
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
 const {conversations,detail}=useLoaderData<typeof loader>();
 const feedback=useFetcher<typeof action>();
 return <s-page heading="Running Advisor · Conversazioni">
  <s-section heading="Ultime conversazioni">
   <s-paragraph>Accesso riservato allo staff autenticato nell'app Shopify. Storico disponibile da quando la registrazione è attiva; conservazione massima 30 giorni.</s-paragraph>
   <div style={{display:"grid",gridTemplateColumns:"minmax(220px,1fr) minmax(320px,2fr)",gap:20}}>
    <div style={{maxHeight:640,overflowY:"auto"}}>
     {conversations.length===0?<p>Nessuna conversazione registrata.</p>:conversations.map(c=>
      <div key={c.id} style={{padding:12,borderBottom:"1px solid #ddd"}}>
       <Link to={"/app/advisor-conversations?conversation="+encodeURIComponent(c.id)}>
        {new Date(c.updatedAt).toLocaleString("it-IT")} · {c._count.messages} messaggi
       </Link>
       <div style={{fontSize:12,color:"#666",overflowWrap:"anywhere"}}>{c.messages[0]?.content.slice(0,110)||"Conversazione"}</div>
       <small>{c._count.feedback} feedback</small>
      </div>)}
    </div>
    <div style={{maxHeight:680,overflowY:"auto",padding:12}}>
     {!detail?<p>Seleziona una conversazione per leggere i messaggi.</p>:<>
      <h3>Conversazione · {new Date(detail.createdAt).toLocaleString("it-IT")}</h3>
      {detail.messages.map(m=><div key={m.id} style={{padding:12,marginBottom:8,borderRadius:10,background:m.role==="user"?"#f1f1f1":"#eaf2ff",whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
       <strong>{m.role==="user"?"Cliente":"Running Advisor"}</strong><p>{m.content}</p>
      </div>)}
      <h3>Feedback staff</h3>
      <feedback.Form method="post">
       <input type="hidden" name="conversationId" value={detail.id}/>
       <label>Valutazione <select name="rating" required defaultValue="needs_review">
        <option value="useful">Risposta utile</option><option value="needs_review">Da migliorare</option><option value="incorrect">Risposta errata</option>
       </select></label>
       <div><textarea name="note" maxLength={2000} rows={4} placeholder="Cosa dovrebbe fare meglio l'Advisor?" style={{width:"100%",marginTop:8}}/></div>
       <button type="submit" disabled={feedback.state!=="idle"}>Salva feedback</button>
       {feedback.data?.ok&&<span> Feedback salvato.</span>}
      </feedback.Form>
      {detail.feedback.map(item=><p key={item.id}><strong>{item.rating}</strong> · {item.note} <small>{new Date(item.createdAt).toLocaleString("it-IT")}</small></p>)}
     </>}
    </div>
   </div>
  </s-section>
 </s-page>;
}
