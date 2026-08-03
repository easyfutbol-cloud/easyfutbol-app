export async function previewCompetitiveSeasonCompletion(db, seasonId) {
  const [[season]]=await db.query('SELECT * FROM competitive_seasons WHERE id=?',[seasonId]);
  if (!season) { const error=new Error('Temporada no encontrada'); error.statusCode=404; throw error; }
  const [divisions]=await db.query('SELECT * FROM competitive_divisions WHERE is_active=1 ORDER BY tier');
  const divisionByTier=new Map(divisions.map((division)=>[Number(division.tier),division]));
  const [cohorts]=await db.query(
    `SELECT DISTINCT csp.location_id,csp.division_id,d.tier,d.promotion_slots,d.relegation_slots,
      d.name AS division_name,d.color_hex,l.name AS location_name
     FROM competitive_season_players csp JOIN competitive_divisions d ON d.id=csp.division_id
     LEFT JOIN locations l ON l.id=csp.location_id
     WHERE csp.season_id=? AND csp.status NOT IN ('inactive','withdrawn','disqualified')`,[seasonId]
  );
  const groups=[]; const totals={ players:0,promoted:0,relegated:0,champions:0 };
  for (const cohort of cohorts) {
    const [players]=await db.query(
      `SELECT csp.user_id,COALESCE(css.total_score,0) AS total_score,u.name
       FROM competitive_season_players csp JOIN users u ON u.id=csp.user_id
       LEFT JOIN competitive_season_standings css ON css.season_id=csp.season_id AND css.user_id=csp.user_id
       WHERE csp.season_id=? AND csp.location_id=? AND csp.division_id=?
         AND csp.status NOT IN ('inactive','withdrawn','disqualified')
       ORDER BY total_score DESC,u.name ASC`,[seasonId,cohort.location_id,cohort.division_id]
    );
    const projected=players.map((player,index)=>{
      const position=index+1,lastFromBottom=players.length-index;
      let outcome=position===1?'champion':'maintained'; let nextDivision=divisionByTier.get(Number(cohort.tier));
      if (Number(cohort.promotion_slots)>0 && position<=Number(cohort.promotion_slots)) {
        nextDivision=divisionByTier.get(Number(cohort.tier)+1) || nextDivision;
        if (position!==1 && Number(nextDivision.id)!==Number(cohort.division_id)) outcome='promoted';
      } else if (Number(cohort.relegation_slots)>0 && lastFromBottom<=Number(cohort.relegation_slots)) {
        nextDivision=divisionByTier.get(Number(cohort.tier)-1) || nextDivision;
        if (Number(nextDivision.id)!==Number(cohort.division_id)) outcome='relegated';
      }
      totals.players+=1; if (outcome==='champion') totals.champions+=1;
      if (Number(nextDivision.id)!==Number(cohort.division_id) && Number(nextDivision.tier)>Number(cohort.tier)) totals.promoted+=1;
      if (outcome==='relegated') totals.relegated+=1;
      return { ...player,position,outcome,next_division_id:nextDivision.id,next_division_name:nextDivision.name,next_division_color:nextDivision.color_hex };
    });
    groups.push({ ...cohort,players:projected });
  }
  return { season,totals,groups };
}

export async function completeCompetitiveSeason(db, seasonId, adminId) {
  const [[season]]=await db.query('SELECT * FROM competitive_seasons WHERE id=? FOR UPDATE',[seasonId]);
  if (!season) { const error=new Error('Temporada no encontrada'); error.statusCode=404; throw error; }
  if (season.status==='completed') return { season_id:season.id,already_completed:true };
  const [[weeks]]=await db.query("SELECT COUNT(*) AS total,SUM(status='scored') AS scored FROM competitive_weeks WHERE season_id=?",[seasonId]);
  if (Number(weeks.total)!==4 || Number(weeks.scored)!==4) { const error=new Error('Las cuatro semanas deben estar puntuadas antes de cerrar la temporada'); error.statusCode=409; throw error; }

  const [divisions]=await db.query('SELECT * FROM competitive_divisions WHERE is_active=1 ORDER BY tier');
  const divisionByTier=new Map(divisions.map((division)=>[Number(division.tier),division]));
  const [cohorts]=await db.query(
    `SELECT DISTINCT csp.location_id,csp.division_id,d.tier,d.promotion_slots,d.relegation_slots
     FROM competitive_season_players csp JOIN competitive_divisions d ON d.id=csp.division_id
     WHERE csp.season_id=? AND csp.status NOT IN ('inactive','withdrawn','disqualified')`,[seasonId]
  );
  let processed=0,promoted=0,relegated=0,champions=0;
  for (const cohort of cohorts) {
    const [players]=await db.query(
      `SELECT csp.user_id,COALESCE(css.total_score,0) AS total_score,u.name
       FROM competitive_season_players csp JOIN users u ON u.id=csp.user_id
       LEFT JOIN competitive_season_standings css ON css.season_id=csp.season_id AND css.user_id=csp.user_id
       WHERE csp.season_id=? AND csp.location_id=? AND csp.division_id=?
         AND csp.status NOT IN ('inactive','withdrawn','disqualified')
       ORDER BY total_score DESC,u.name ASC`,[seasonId,cohort.location_id,cohort.division_id]
    );
    for (let index=0;index<players.length;index+=1) {
      const player=players[index]; const position=index+1; const lastFromBottom=players.length-index;
      let outcome='maintained'; let nextDivisionId=cohort.division_id; let movedUp=false;
      if (position===1) { outcome='champion'; champions+=1; }
      if (Number(cohort.promotion_slots)>0 && position<=Number(cohort.promotion_slots)) {
        nextDivisionId=divisionByTier.get(Number(cohort.tier)+1)?.id || cohort.division_id;
        movedUp=Number(nextDivisionId)!==Number(cohort.division_id);
        if (Number(nextDivisionId)!==Number(cohort.division_id) && position!==1) outcome='promoted';
        if (Number(nextDivisionId)!==Number(cohort.division_id)) promoted+=1;
      } else if (Number(cohort.relegation_slots)>0 && lastFromBottom<=Number(cohort.relegation_slots)) {
        nextDivisionId=divisionByTier.get(Number(cohort.tier)-1)?.id || cohort.division_id;
        if (Number(nextDivisionId)!==Number(cohort.division_id)) { outcome='relegated'; relegated+=1; }
      }
      await db.query(
        `INSERT INTO competitive_season_results
         (season_id,user_id,location_id,division_id,next_division_id,division_position,total_score,outcome)
         VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE next_division_id=VALUES(next_division_id),
         division_position=VALUES(division_position),total_score=VALUES(total_score),outcome=VALUES(outcome)`,
        [seasonId,player.user_id,cohort.location_id,cohort.division_id,nextDivisionId,position,player.total_score,outcome]
      );
      await db.query('UPDATE competitive_season_players SET final_position=?,final_points=? WHERE season_id=? AND user_id=?',[position,player.total_score,seasonId,player.user_id]);
      const badgeCodes=['season_complete'];
      if (position===1) badgeCodes.push('division_champion');
      if (movedUp) badgeCodes.push('promoted');
      for (const code of badgeCodes) await db.query(
        `INSERT IGNORE INTO competitive_user_badges (user_id,badge_id,season_id)
         SELECT ?,id,? FROM competitive_badges WHERE code=?`,[player.user_id,seasonId,code]
      );
      if (position===1) await db.query(
        `INSERT IGNORE INTO competitive_rewards (user_id,season_id,reward_code,title,description)
         VALUES (?,?,'division_champion','Campeón de división','Recompensa especial por finalizar primero en tu división.')`,[player.user_id,seasonId]
      );
      processed+=1;
    }
  }
  await db.query("UPDATE competitive_seasons SET status='completed',completed_at=NOW() WHERE id=?",[seasonId]);
  return { season_id:seasonId,processed,promoted,relegated,champions,completed_by:adminId };
}
