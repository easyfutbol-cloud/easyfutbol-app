import { Expo } from 'expo-server-sdk';
import { pool } from '../config/db.js';
import { markSchedulerFailure, markSchedulerSuccess, registerScheduler } from './operationalHealthService.js';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

async function deactivateToken(token) {
  await Promise.all([
    pool.query('UPDATE push_tokens SET is_active=0 WHERE expo_push_token=?',[token]),
    pool.query('UPDATE users SET push_token=NULL WHERE push_token=?',[token]),
  ]);
}

async function recordTicket(token,ticket,type,campaignId) {
  const error=ticket?.status==='error';
  if (ticket?.details?.error==='DeviceNotRegistered') await deactivateToken(token);
  await pool.query(
    `INSERT INTO push_delivery_receipts
       (campaign_id,ticket_id,expo_push_token,notification_type,status,error_code,error_message,checked_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [campaignId||null,ticket?.id||null,token,type||null,error?'error':'queued',ticket?.details?.error||null,ticket?.message||null,error?new Date():null]
  );
}

export async function sendPushNotification(tokens = [], { title, body, data = {} }) {
  const messages = [];

  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      console.warn('[PUSH] Token con formato inválido omitido');
      continue;
    }

    const channelId={match_cancelled:'matches',match_updated:'matches',match_reminder:'matches',waitlist_offer:'matches',friend_request:'social',friend_accepted:'social',match_invitation:'social',group_invitation:'social',easypass_gift:'easypass',news:'news'}[data?.type]||'default';
    messages.push({
      to: token,
      sound: 'default',
      channelId,
      title,
      body,
      data,
    });
  }

  if (!messages.length) {
    return [];
  }

  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      await Promise.all(ticketChunk.map((ticket,index)=>recordTicket(chunk[index].to,ticket,data?.type,data?.campaignId).catch(error=>console.error('[PUSH TRACKING]',error?.message||error))));
    } catch (error) {
      console.error('Error enviando push chunk:', error);
    }
  }

  return tickets;
}

export async function checkPushReceipts() {
  const [pending]=await pool.query(
    `SELECT id,ticket_id,expo_push_token FROM push_delivery_receipts
     WHERE status='queued' AND ticket_id IS NOT NULL AND created_at<=DATE_SUB(NOW(),INTERVAL 1 MINUTE)
     ORDER BY id ASC LIMIT 1000`
  );
  if(!pending.length)return{checked:0,delivered:0,failed:0};
  const byTicket=new Map(pending.map(row=>[row.ticket_id,row]));
  let delivered=0,failed=0;
  for(const ids of expo.chunkPushNotificationReceiptIds([...byTicket.keys()])){
    const receipts=await expo.getPushNotificationReceiptsAsync(ids);
    for(const[ticketId,receipt]of Object.entries(receipts)){
      const row=byTicket.get(ticketId);if(!row)continue;
      const error=receipt.status==='error';
      await pool.query(`UPDATE push_delivery_receipts SET status=?,error_code=?,error_message=?,checked_at=NOW() WHERE id=?`,[error?'error':'delivered',receipt.details?.error||null,receipt.message||null,row.id]);
      if(receipt.details?.error==='DeviceNotRegistered')await deactivateToken(row.expo_push_token);
      if(error)failed+=1;else delivered+=1;
    }
  }
  return{checked:pending.length,delivered,failed};
}

let receiptSchedulerStarted=false;
export function startPushReceiptScheduler({intervalMinutes=15}={}){
  if(receiptSchedulerStarted)return;receiptSchedulerStarted=true;
  registerScheduler('push-receipts',{maxAgeSeconds:35*60});
  const run=async()=>{try{const result=await checkPushReceipts();markSchedulerSuccess('push-receipts');if(result.checked)console.log('[PUSH RECEIPTS]',result);}catch(error){markSchedulerFailure('push-receipts',error);console.error('[PUSH RECEIPTS]',error?.message||error);}};
  run();setInterval(run,Math.max(5,Number(intervalMinutes)||15)*60*1000);
}
