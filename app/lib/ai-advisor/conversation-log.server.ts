import prisma from "../../db.server";

type Message = {role:"user"|"assistant";content:string};
export async function logAdvisorExchange(input:{
 shop:string; visitorId:string; userText:string; assistantText:string; customerId?:string|null;
}):Promise<void>{
 if(!/^[a-f0-9-]{36}$/i.test(input.visitorId))return;
 const conversation=await prisma.advisorConversation.upsert({
  where:{shop_visitorId:{shop:input.shop,visitorId:input.visitorId}},
  create:{shop:input.shop,visitorId:input.visitorId,customerId:input.customerId||null},
  update:input.customerId?{customerId:input.customerId}:{}
 });
 await prisma.advisorMessage.createMany({data:[
  {conversationId:conversation.id,role:"user",content:input.userText.slice(0,1000)},
  {conversationId:conversation.id,role:"assistant",content:input.assistantText.slice(0,3000)}
 ]});
 // A short retention period limits unnecessary storage of customer conversations.
 await prisma.advisorConversation.deleteMany({where:{updatedAt:{lt:new Date(Date.now()-30*86400000)}}});
}
