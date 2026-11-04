// Reparte los asistentes de /matches/:id/attendees por color de camiseta. Quien
// compró entradas de los dos colores aparece en ambos equipos.
export function groupAttendeesByTeam(attendees) {
  const teams = { white: [], black: [], pending: [] };

  for (const attendee of attendees || []) {
    const player = { id: attendee.user_id, name: attendee.username || 'Jugador' };
    const white = Number(attendee.white_tickets || 0);
    const black = Number(attendee.black_tickets || 0);

    if (white > 0) teams.white.push({ ...player, tickets: white });
    if (black > 0) teams.black.push({ ...player, tickets: black });
    if (white === 0 && black === 0) teams.pending.push({ ...player, tickets: 1 });
  }

  return teams;
}

export function countTeamPlayers(teams) {
  return [...teams.white, ...teams.black, ...teams.pending].reduce((total, player) => total + player.tickets, 0);
}
