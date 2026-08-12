export async function getPlayerReputation(db,userId) {
  const [[attendance]]=await db.query(
    `SELECT COUNT(DISTINCT i.match_id) scheduled_matches,
            COUNT(DISTINCT CASE WHEN pfw.reason='no_show' THEN i.match_id END) no_shows
     FROM inscriptions i JOIN matches m ON m.id=i.match_id
     LEFT JOIN plus_fair_play_warnings pfw ON pfw.inscription_id=i.id AND pfw.reason='no_show'
     WHERE i.user_id=? AND i.status IN ('confirmed','paid','active') AND m.starts_at<NOW() AND m.status<>'cancelled'`,[userId]
  );
  const [[cancellations]]=await db.query(
    `SELECT COUNT(DISTINCT i.match_id) cancellations,
            COUNT(DISTINCT CASE WHEN pfw.reason='late_cancellation' THEN i.match_id END) late_cancellations
     FROM inscriptions i LEFT JOIN plus_fair_play_warnings pfw ON pfw.inscription_id=i.id AND pfw.reason='late_cancellation'
     WHERE i.user_id=? AND i.status IN ('cancelled','canceled')`,[userId]
  );
  const [[stats]]=await db.query('SELECT COUNT(DISTINCT match_id) recorded_matches FROM match_player_stats WHERE user_id=?',[userId]);
  const scheduled=Number(attendance.scheduled_matches||0),noShows=Number(attendance.no_shows||0);
  const completed=Math.max(Number(stats.recorded_matches||0),scheduled-noShows,0);
  const opportunities=Math.max(completed+noShows,scheduled);
  const attendanceRate=opportunities ? Math.round((completed/opportunities)*100) : 0;
  const cancellationsTotal=Number(cancellations.cancellations||0),lateCancellations=Number(cancellations.late_cancellations||0);
  const badges=[];
  if (completed>=1) badges.push({code:'first_match',label:'Primer partido',icon:'football',description:'Ya ha disputado su primer partido'});
  if (completed>=10) badges.push({code:'regular',label:'Jugador habitual',icon:'calendar',description:'10 partidos completados'});
  if (completed>=25) badges.push({code:'veteran',label:'Veterano',icon:'shield-checkmark',description:'25 partidos completados'});
  if (opportunities>=5 && attendanceRate>=90 && lateCancellations<=1) badges.push({code:'reliable',label:'Jugador fiable',icon:'checkmark-circle',description:'Más del 90% de asistencia'});
  if (opportunities>=10 && attendanceRate===100) badges.push({code:'perfect_attendance',label:'Asistencia perfecta',icon:'ribbon',description:'100% de asistencia en al menos 10 partidos'});
  return {completed_matches:completed,attendance_opportunities:opportunities,attendance_rate:attendanceRate,no_shows:noShows,cancellations:cancellationsTotal,late_cancellations:lateCancellations,early_cancellations:Math.max(cancellationsTotal-lateCancellations,0),badges};
}

export const publicReputation = (reputation) => ({
  completed_matches:reputation.completed_matches,
  attendance_rate:reputation.attendance_opportunities>=5 ? reputation.attendance_rate:null,
  badges:reputation.badges,
});
