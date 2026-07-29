import { createClient } from "./client";

export async function getCurrentContext(userId) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select(`
      role,
      roles,
      active,
      organization:organizations(id, name, slug),
      profile:profiles(id, full_name, email)
    `)
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getTournaments(organizationId) {
  const { data, error } = await createClient()
    .from("tournaments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createTournament(organizationId, userId, values) {
  const { data, error } = await createClient().from("tournaments").insert({
    organization_id: organizationId,
    created_by: userId,
    name: values.name,
    category: values.category || null,
    venue: values.venue || null,
    starts_on: values.starts_on || null,
    ends_on: values.ends_on || null,
    status: "rascunho"
  }).select().single();
  if (error) throw error;
  return data;
}

export async function getTeams(tournamentId) {
  const { data, error } = await createClient()
    .from("teams")
    .select("*, group:groups(id, name)")
    .eq("tournament_id", tournamentId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getGroups(tournamentId) {
  const { data, error } = await createClient()
    .from("groups")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("sort_order");
  if (error) throw error;
  return data;
}

export async function createGroup(tournamentId, values) {
  const { data, error } = await createClient().from("groups").insert({
    tournament_id: tournamentId,
    name: values.name,
    sort_order: Number(values.sort_order || 0)
  }).select().single();
  if (error) throw error;
  return data;
}

export async function assignTeamToGroup(teamId, groupId) {
  const { data, error } = await createClient()
    .from("teams")
    .update({ group_id: groupId || null })
    .eq("id", teamId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createTeam(tournamentId, values) {
  const { data, error } = await createClient().from("teams").insert({
    tournament_id: tournamentId,
    name: values.name,
    short_name: values.short_name || values.name.slice(0, 3).toUpperCase(),
    coach_name: values.coach_name || null,
    color: values.color || "#ff6945"
  }).select().single();
  if (error) throw error;
  return data;
}

export async function getPlayers(tournamentId) {
  const { data, error } = await createClient()
    .from("players")
    .select("*, team:teams!inner(id, name, tournament_id)")
    .eq("team.tournament_id", tournamentId)
    .order("full_name");
  if (error) throw error;
  return data;
}

export async function createPlayer(values) {
  const { data, error } = await createClient().from("players").insert({
    team_id: values.team_id,
    full_name: values.full_name,
    shirt_number: values.shirt_number ? Number(values.shirt_number) : null,
    birth_date: values.birth_date || null,
    category: values.category || null
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlayer(playerId, values) {
  const { data, error } = await createClient().from("players").update({
    full_name: values.full_name,
    shirt_number: values.shirt_number ? Number(values.shirt_number) : null,
    birth_date: values.birth_date || null,
    category: values.category || null
  }).eq("id", playerId).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlayer(playerId) {
  const { data, error } = await createClient().from("players").delete().eq("id", playerId).select("id").single();
  if (error) throw error;
  return data;
}

export async function deleteTeam(teamId) {
  const supabase = createClient();
  const { error: homeError } = await supabase.from("matches").delete().eq("home_team_id", teamId);
  if (homeError) throw homeError;
  const { error: awayError } = await supabase.from("matches").delete().eq("away_team_id", teamId);
  if (awayError) throw awayError;
  const { data, error } = await supabase.from("teams").delete().eq("id", teamId).select("id").single();
  if (error) throw error;
  return data;
}

export async function deleteTournament(tournamentId) {
  const { data, error } = await createClient().from("tournaments").delete().eq("id", tournamentId).select("id").single();
  if (error) throw error;
  return data;
}

export async function createMatch(tournamentId, values) {
  const { data, error } = await createClient().from("matches").insert({
    tournament_id: tournamentId,
    home_team_id: values.home_team_id,
    away_team_id: values.away_team_id,
    phase: values.phase || "Fase de grupos",
    scheduled_at: values.scheduled_at || null,
    court: values.court || null
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateMatch(matchId, values) {
  const { data, error } = await createClient().from("matches").update({
    home_team_id: values.home_team_id,
    away_team_id: values.away_team_id,
    phase: values.phase || "Fase de grupos",
    scheduled_at: values.scheduled_at || null,
    court: values.court || null,
    updated_at: new Date().toISOString()
  }).eq("id", matchId).select().single();
  if (error) throw error;
  return data;
}

export async function getTournamentMatches(tournamentId) {
  const { data, error } = await createClient()
    .from("matches")
    .select(`
      *,
      home_team:teams!matches_home_team_id_fkey(id, name, color, short_name),
      away_team:teams!matches_away_team_id_fkey(id, name, color, short_name),
      group:groups(id, name)
    `)
    .eq("tournament_id", tournamentId)
    .order("scheduled_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateMatchScore(matchId, homeScore, awayScore, userId, homeBurned = 0, awayBurned = 0) {
  const { data, error } = await createClient()
    .from("matches")
    .update({
      home_score: homeScore,
      away_score: awayScore,
      home_burned: homeBurned,
      away_burned: awayBurned,
      status: "encerrada",
      updated_by: userId,
      updated_at: new Date().toISOString()
    })
    .eq("id", matchId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export function roleLabel(role) {
  return {
    admin: "Administrador",
    professor: "Professor",
    treinador: "Treinador",
    arbitro: "Árbitro",
    visualizador: "Visualizador"
  }[role] || "Visualizador";
}

export async function getOrganizationUsers(organizationId) {
  const { data, error } = await createClient()
    .from("memberships")
    .select("id, user_id, role, roles, active, profile:profiles(id, full_name, email)")
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function updateOrganizationUserRoles(membershipId, roles) {
  if (!roles?.length) throw new Error("Selecione pelo menos uma função.");
  const { data, error } = await createClient()
    .from("memberships")
    .update({ role: roles[0], roles })
    .eq("id", membershipId)
    .select("id, user_id, role, roles, active")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteOrganizationUser(organizationId, membershipId, currentUserId) {
  const { data, error } = await createClient()
    .from("memberships")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", membershipId)
    .neq("user_id", currentUserId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Não é possível excluir o seu próprio acesso.");
  return data;
}

export async function getInvitations(organizationId) {
  const { data, error } = await createClient()
    .from("invitations")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createInvitation(organizationId, userId, values) {
  const roles = Array.isArray(values.roles) && values.roles.length ? values.roles : [values.role || "visualizador"];
  const { data, error } = await createClient().from("invitations").insert({
    organization_id: organizationId,
    invited_by: userId,
    email: values.email.trim().toLowerCase(),
    role: roles[0],
    roles
  }).select().single();
  if (error) throw error;
  return data;
}

export async function claimInvitation(token) {
  const { data, error } = await createClient().rpc("claim_invitation", {
    invite_token: token
  });
  if (error) throw error;
  return data;
}

export async function getAuditLog(organizationId) {
  const { data, error } = await createClient()
    .from("audit_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function publishTournament(tournamentId) {
  const { data, error } = await createClient()
    .from("tournaments")
    .update({ status: "em_andamento" })
    .eq("id", tournamentId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getPublicTournament(tournamentId) {
  const supabase = createClient();
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id, name, category, venue, starts_on, ends_on, status")
    .eq("id", tournamentId)
    .in("status", ["em_andamento", "encerrado"])
    .maybeSingle();
  if (error) throw error;
  if (!tournament) return null;
  const [teamsResult, matchesResult] = await Promise.all([
    supabase.from("teams").select("id,name,short_name,color,group_id").eq("tournament_id", tournamentId),
    supabase.from("matches").select(`
      *, home_team:teams!matches_home_team_id_fkey(id,name,short_name,color),
      away_team:teams!matches_away_team_id_fkey(id,name,short_name,color),
      group:groups(id,name)
    `).eq("tournament_id", tournamentId).order("scheduled_at")
  ]);
  if (teamsResult.error) throw teamsResult.error;
  if (matchesResult.error) throw matchesResult.error;
  return { tournament, teams: teamsResult.data, matches: matchesResult.data };
}
