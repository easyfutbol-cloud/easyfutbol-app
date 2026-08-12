import { pool } from '../config/db.js';
import { getCityPushTokens,getMatchPushTokens,getSegmentPushAudience,getUserPushToken,sendExpoPush } from './push.js';
import { markSchedulerFailure,markSchedulerSuccess,registerScheduler } from './operationalHealthService.js';

async function campaignTokens(campaign){
  if(campaign.target_type==='city')return getCityPushTokens(campaign.target_id);
  if(campaign.target_type==='match')return getMatchPushTokens(Number(campaign.target_id));
  if(campaign.target_type==='user'){const token=await getUserPushToken(Number(campaign.target_id));return token?[token]:[];}
  if(campaign.target_type==='segment')return(await getSegmentPushAudience(campaign.target_id)).tokens;
  return[];
}

export async function sendNotificationCampaign(campaignId,{force=false}={}){
  const [claim]=await pool.query(
    `UPDATE notification_campaigns SET status='sending',claimed_at=NOW(),failure_message=NULL
     WHERE id=? AND status IN ('draft','scheduled') AND (?=1 OR scheduled_at<=UTC_TIMESTAMP())`,
    [campaignId,force?1:0]
  );
  if(!claim.affectedRows)return{ok:false,skipped:true};
  try{
    const[[campaign]]=await pool.query('SELECT * FROM notification_campaigns WHERE id=?',[campaignId]);
    const tokens=await campaignTokens(campaign);
    const data={type:campaign.target_type==='match'?'match':'city',campaignId:Number(campaign.id)};
    if(campaign.target_type==='match'){data.matchId=Number(campaign.target_id);data.screen='Match';}
    if(campaign.target_type==='city')data.locationSlug=campaign.target_id;
    if(campaign.target_type==='user'){data.type='direct';data.userId=Number(campaign.target_id);}
    if(campaign.target_type==='segment'){data.type='news';data.segment=campaign.target_id;}
    const delivery=await sendExpoPush(tokens,campaign.title,campaign.body,data);
    await pool.query(`UPDATE notification_campaigns SET status='sent',sent_at=NOW(),token_count=?,accepted_count=?,rejected_count=? WHERE id=?`,[tokens.length,delivery.sent||0,delivery.failed||0,campaignId]);
    return{ok:true,campaignId,tokens:tokens.length,...delivery};
  }catch(error){await pool.query(`UPDATE notification_campaigns SET status='failed',failure_message=? WHERE id=?`,[String(error?.message||error).slice(0,500),campaignId]);throw error;}
}

export async function processScheduledNotificationCampaigns(){
  const[rows]=await pool.query(`SELECT id FROM notification_campaigns WHERE status='scheduled' AND scheduled_at<=UTC_TIMESTAMP() ORDER BY scheduled_at ASC LIMIT 50`);
  let sent=0,failed=0;
  for(const row of rows){try{const result=await sendNotificationCampaign(row.id);if(result.ok)sent+=1;}catch(error){failed+=1;console.error('[SCHEDULED NOTIFICATION]',{campaignId:row.id,error:error?.message||error});}}
  return{scanned:rows.length,sent,failed};
}

let started=false,running=false;
export function startNotificationCampaignScheduler({intervalMinutes=1}={}){
  if(started)return;started=true;registerScheduler('scheduled-notifications',{maxAgeSeconds:180});
  const run=async()=>{if(running)return;running=true;try{const result=await processScheduledNotificationCampaigns();markSchedulerSuccess('scheduled-notifications');if(result.scanned)console.log('[SCHEDULED NOTIFICATIONS]',result);}catch(error){markSchedulerFailure('scheduled-notifications',error);console.error('[SCHEDULED NOTIFICATIONS]',error?.message||error);}finally{running=false;}};
  run();setInterval(run,Math.max(1,Number(intervalMinutes)||1)*60*1000);
}
