const daysSince = (value) => value ? Math.max(0,(Date.now()-new Date(value).getTime())/86400000) : 9999;

export function summarizeSocialMatches(rows, friendshipCreatedAt=null) {
  const ordered=[...rows].sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));
  let currentWinStreak=0,bestWinStreak=0;
  for (const row of ordered) {
    if (row.result === 'win') { currentWinStreak+=1; bestWinStreak=Math.max(bestWinStreak,currentWinStreak); }
    else currentWinStreak=0;
  }
  const matches=ordered.length;
  const wins=ordered.filter((row)=>row.result==='win').length;
  const draws=ordered.filter((row)=>row.result==='draw').length;
  const losses=ordered.filter((row)=>row.result==='loss').length;
  const sameTeam=ordered.filter((row)=>row.relationship==='teammate').length;
  const rivals=ordered.filter((row)=>row.relationship==='rival').length;
  const winRate=matches ? wins/matches : 0;
  const last=ordered.at(-1) || null;
  const volume=Math.min(Math.log1p(matches)/Math.log1p(30),1);
  const recency=Math.exp(-daysSince(last?.starts_at)/90);
  const confidence=Math.min(matches/12,1);
  const friendshipAge=Math.min(daysSince(friendshipCreatedAt)/365,1);
  // Compatibilidad (0-100): victorias 45%, volumen logarítmico 25%, actividad reciente
  // 15%, racha 10% y antigüedad de amistad 5%. La confianza (partidos/12) mezcla
  // el resultado con una base prudente de 35 para impedir extremos con poca muestra.
  const rawCompatibility=winRate*45+volume*25+recency*15+Math.min(currentWinStreak/5,1)*10+friendshipAge*5;
  const compatibility=Math.round(rawCompatibility*confidence+35*(1-confidence));
  const bayesianWinRate=(wins+3)/(matches+6);
  // Ranking de compañeros: tasa de victorias bayesiana (prior 3/6) 55%, volumen
  // logarítmico 25%, recencia 10% y racha 10%. El prior evita que un 1/1 sea líder.
  const teammateScore=Math.round((bayesianWinRate*55+volume*25+recency*10+Math.min(currentWinStreak/5,1)*10)*10)/10;
  return {
    matches_together:matches,wins,draws,losses,win_rate:Math.round(winRate*100),
    current_streak:currentWinStreak,best_win_streak:bestWinStreak,same_team:sameTeam,rivals,
    unknown_team:matches-sameTeam-rivals,last_match:last ? { id:last.match_id,title:last.title,starts_at:last.starts_at } : null,
    compatibility,teammate_score:teammateScore,
  };
}

async function commonMatchRows(db, userId, otherUserIds) {
  if (!otherUserIds.length) return [];
  const placeholders=otherUserIds.map(()=>'?').join(',');
  const [rows]=await db.query(
    `SELECT b.user_id AS other_user_id,b.match_id,m.title,m.starts_at,a.result,
       CASE WHEN ia.ticket_type IS NULL OR ib.ticket_type IS NULL THEN 'unknown'
            WHEN ia.ticket_type=ib.ticket_type THEN 'teammate' ELSE 'rival' END AS relationship
     FROM match_player_stats a
     JOIN match_player_stats b ON b.match_id=a.match_id AND b.user_id IN (${placeholders})
     JOIN matches m ON m.id=a.match_id
     LEFT JOIN inscriptions ia ON ia.match_id=a.match_id AND ia.user_id=a.user_id AND ia.status='confirmed'
     LEFT JOIN inscriptions ib ON ib.match_id=b.match_id AND ib.user_id=b.user_id AND ib.status='confirmed'
     WHERE a.user_id=? AND a.result IN ('win','draw','loss') AND m.starts_at<NOW()
     GROUP BY b.user_id,b.match_id,m.title,m.starts_at,a.result,relationship
     ORDER BY m.starts_at ASC`,
    [...otherUserIds,userId]
  );
  return rows;
}

export async function getPairStats(db,userId,otherUserId,friendshipCreatedAt=null) {
  return summarizeSocialMatches(await commonMatchRows(db,userId,[otherUserId]),friendshipCreatedAt);
}

export async function getBestTeammates(db,userId,limit=10) {
  const [friends]=await db.query(
    `SELECT IF(requester_id=?,addressee_id,requester_id) AS user_id,created_at
     FROM friendships WHERE status='accepted' AND (requester_id=? OR addressee_id=?)`,
    [userId,userId,userId]
  );
  const ids=friends.map((row)=>Number(row.user_id));
  if (!ids.length) return [];
  const rows=await commonMatchRows(db,userId,ids);
  const byUser=new Map(ids.map((id)=>[id,[]]));
  rows.forEach((row)=>byUser.get(Number(row.other_user_id))?.push(row));
  const [users]=await db.query(`SELECT id,name,avatar_url,preferred_location FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
  const created=new Map(friends.map((row)=>[Number(row.user_id),row.created_at]));
  return users.map((user)=>({...user,...summarizeSocialMatches(byUser.get(Number(user.id)) || [],created.get(Number(user.id)))}))
    .filter((item)=>item.matches_together>0).sort((a,b)=>b.teammate_score-a.teammate_score || b.matches_together-a.matches_together).slice(0,limit);
}

export async function getFrequentPlayers(db,userId,limit=20) {
  const [rows]=await db.query(
    `SELECT u.id,u.name,u.avatar_url,u.preferred_location,COUNT(DISTINCT b.match_id) AS matches_together,
       CASE WHEN f.status='accepted' THEN 'friends'
            WHEN f.status='pending' AND f.requester_id=? THEN 'sent'
            WHEN f.status='pending' THEN 'received' ELSE 'none' END AS friendship_status
     FROM match_player_stats a JOIN match_player_stats b ON b.match_id=a.match_id AND b.user_id<>a.user_id
     JOIN users u ON u.id=b.user_id
     LEFT JOIN friendships f ON f.user_low_id=LEAST(?,u.id) AND f.user_high_id=GREATEST(?,u.id)
     JOIN matches m ON m.id=a.match_id
     WHERE a.user_id=? AND m.starts_at<NOW()
     GROUP BY u.id,u.name,u.avatar_url,u.preferred_location,f.status,f.requester_id
     ORDER BY matches_together DESC,u.name ASC LIMIT ?`,
    [userId,userId,userId,userId,limit]
  );
  return rows.map((row)=>({...row,matches_together:Number(row.matches_together)}));
}
