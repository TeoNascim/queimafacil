"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../lib/supabase/client";
import {
  assignTeamToGroup, createGroup, createMatch, createPlayer, createTeam, createTournament,
  claimInvitation, deleteGroup, deleteOrganizationUser, deletePlayer, deleteTeam, deleteTournament,
  getCurrentContext, getGroups, getInvitations, generateSecondPhase,
  getAuditLog, getMatchReferees, getOrganizationUsers, getPlayers, getPublicTournament, getTeams,
  getTournamentMatches, getTournaments, publishTournament, roleLabel, updateMatchScore,
  updatePlayer, updateMatch, updateTeam,
  createMatchReferee, updateMatchReferee, deleteMatchReferee
} from "../lib/supabase/data";

const icons = {
  dashboard: "▦", tournaments: "🏆", matches: "◎", teams: "♟", groups: "◫", players: "♙",
  standings: "≡", referees: "⚑", reports: "▤", regulations: "§", users: "♧", settings: "⚙"
};

const TOURNAMENT_TIME_ZONE = "America/Sao_Paulo";

function tournamentDateParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TOURNAMENT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value])
  );
}

const initialMatches = [
  { id: 1, time: "09:00", court: "Quadra A", round: "Grupo A · Rodada 3", a: "Falcões", b: "Titãs", sa: 2, sb: 1, status: "Encerrada", ca: "#ff6b45", cb: "#6547d9" },
  { id: 2, time: "10:30", court: "Quadra B", round: "Grupo B · Rodada 3", a: "Tempestade", b: "Invictos", sa: null, sb: null, status: "Próxima", ca: "#18a999", cb: "#ef9b28" },
  { id: 3, time: "12:00", court: "Quadra A", round: "Grupo A · Rodada 3", a: "Águias", b: "Vikings", sa: null, sb: null, status: "Agendada", ca: "#d9485f", cb: "#2962a9" }
];

const standings = [
  { p: 1, team: "Falcões", tag: "FAL", pts: 9, j: 3, v: 3, d: 0, sp: 6, sc: 2, saldo: 4, color: "#ff6b45" },
  { p: 2, team: "Tempestade", tag: "TEM", pts: 6, j: 2, v: 2, d: 0, sp: 4, sc: 1, saldo: 3, color: "#18a999" },
  { p: 3, team: "Titãs", tag: "TIT", pts: 6, j: 3, v: 2, d: 1, sp: 5, sc: 3, saldo: 2, color: "#6547d9" },
  { p: 4, team: "Invictos", tag: "INV", pts: 3, j: 2, v: 1, d: 1, sp: 3, sc: 3, saldo: 0, color: "#ef9b28" },
  { p: 5, team: "Águias", tag: "AGU", pts: 0, j: 2, v: 0, d: 2, sp: 1, sc: 4, saldo: -3, color: "#d9485f" },
  { p: 6, team: "Vikings", tag: "VIK", pts: 0, j: 2, v: 0, d: 2, sp: 0, sc: 4, saldo: -4, color: "#2962a9" }
];

const teams = [
  { name: "Falcões", coach: "Profa. Ana Lima", players: 12, group: "A", color: "#ff6b45" },
  { name: "Tempestade", coach: "Prof. Carlos Dias", players: 11, group: "B", color: "#18a999" },
  { name: "Titãs", coach: "Prof. Bruno Reis", players: 12, group: "A", color: "#6547d9" },
  { name: "Invictos", coach: "Profa. Joana Luz", players: 10, group: "B", color: "#ef9b28" },
  { name: "Águias", coach: "Prof. Paulo Sá", players: 12, group: "A", color: "#d9485f" },
  { name: "Vikings", coach: "Profa. Vera Cruz", players: 11, group: "A", color: "#2962a9" }
];

const menu = [
  ["dashboard", "Visão geral"], ["tournaments", "Torneios"], ["matches", "Partidas"],
  ["teams", "Equipes"], ["groups", "Grupos"], ["players", "Jogadores"], ["standings", "Classificação"],
  ["referees", "Escala de árbitros"], ["reports", "Súmulas"], ["regulations", "Regulamento"], ["users", "Usuários"]
];

export default function App() {
  const [session, setSession] = useState(undefined);
  const [publicId, setPublicId] = useState(undefined);
  const [page, setPage] = useState("dashboard");
  const [matches, setMatches] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [mobile, setMobile] = useState(false);
  const [role, setRole] = useState("Administrador");
  const [account, setAccount] = useState({ name: "Usuário", organization: "CoordEDF" });
  const [context, setContext] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [teamRows, setTeamRows] = useState([]);
  const [playerRows, setPlayerRows] = useState([]);
  const [groupRows, setGroupRows] = useState([]);
  const [userRows, setUserRows] = useState([]);
  const [invitationRows, setInvitationRows] = useState([]);
  const [auditRows, setAuditRows] = useState([]);
  const [refereeRows, setRefereeRows] = useState([]);
  const [activeTournament, setActiveTournament] = useState(null);

  useEffect(() => {
    setPublicId(new URLSearchParams(window.location.search).get("public") || "");
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user?.id) return;
    const acceptToken = new URLSearchParams(window.location.search).get("invite");
    const acceptInvite = acceptToken ? claimInvitation(acceptToken).then(() => {
      window.history.replaceState({}, "", window.location.pathname);
    }) : Promise.resolve();
    acceptInvite.then(() => getCurrentContext(session.user.id))
      .then(context => {
        if (!context) {
          setToast("Sua conta ainda não possui acesso a uma organização.");
          return;
        }
        setRole((context.roles?.length ? context.roles : [context.role]).map(roleLabel).join(" · "));
        setContext(context);
        setAccount({
          name: context.profile?.full_name || session.user.email?.split("@")[0] || "Usuário",
          organization: context.organization?.name || "CoordEDF"
        });
        return refreshWorkspace(context.organization?.id);
      })
      .catch(error => {
        console.error("Erro ao carregar o espaço de trabalho:", error);
        setToast(error?.message ? `Erro ao carregar dados: ${error.message}` : "Não foi possível carregar os dados da organização.");
      });
  }, [session]);

  const refreshWorkspace = async (organizationId, preferredTournamentId) => {
    const tournamentRows = await getTournaments(organizationId);
    setTournaments(tournamentRows);
    const selected = tournamentRows.find(item => item.id === preferredTournamentId) || tournamentRows[0] || null;
    setActiveTournament(selected);
    if (!selected) {
      setMatches([]); setTeamRows([]); setPlayerRows([]); setGroupRows([]); setRefereeRows([]);
      return;
    }
    const loadUsers = async () => {
      const response = await fetch(`/api/admin/users?organization_id=${encodeURIComponent(organizationId)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
      if (response.ok) return (await response.json()).users;
      return getOrganizationUsers(organizationId);
    };
    const [dbMatches, dbTeams, dbPlayers, dbGroups, dbUsers, dbInvitations, dbAudit, dbReferees] = await Promise.all([
      getTournamentMatches(selected.id), getTeams(selected.id), getPlayers(selected.id), getGroups(selected.id),
      loadUsers(), getInvitations(organizationId), getAuditLog(organizationId), getMatchReferees(selected.id)
    ]);
    setMatches(dbMatches.map(mapMatch));
    setTeamRows(dbTeams);
    setPlayerRows(dbPlayers);
    setGroupRows(dbGroups);
    setUserRows(dbUsers);
    setInvitationRows(dbInvitations);
    setAuditRows(dbAudit);
    setRefereeRows(dbReferees);
  };
  const classification = useMemo(() => buildStandings(teamRows, matches), [teamRows, matches]);

  if (publicId === undefined) return <div className="auth-loading"><span className="brand-mark">Q</span><p>Preparando o QueimaFácil…</p></div>;
  if (publicId) return <PublicDashboard tournamentId={publicId} />;

  if (session === undefined) {
    return <div className="auth-loading"><span className="brand-mark">Q</span><p>Preparando o QueimaFácil…</p></div>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  if (session.user.app_metadata?.must_change_password) {
    return <ForcePasswordChange session={session} onComplete={setSession} />;
  }

  const saveScore = async (id, a, b, burnedA, burnedB) => {
    try {
      await updateMatchScore(id, Number(a), Number(b), session.user.id, Number(burnedA), Number(burnedB));
      await refreshWorkspace(context.organization.id, activeTournament.id);
      setModal(null); notify("Placar publicado no Supabase");
    } catch {
      notify("Não foi possível salvar o placar.");
    }
  };
  const saveRecord = async (type, values) => {
    try {
      if (type === "newTournament") {
        const created = await createTournament(context.organization.id, session.user.id, values);
        await refreshWorkspace(context.organization.id, created.id);
      } else {
        if (type === "newUser") {
          const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
              organization_id: context.organization.id,
              full_name: values.full_name,
              email: values.email,
              password: values.password,
              roles: values.roles
            })
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Não foi possível criar o usuário.");
          await refreshWorkspace(context.organization.id, activeTournament?.id);
          setModal(null);
          notify("Usuário criado com senha temporária");
          return;
        }
        if (!activeTournament) throw new Error("Crie um torneio primeiro.");
        if (type === "newTeam") await createTeam(activeTournament.id, values);
        if (type === "editTeam") await updateTeam(values.id, values);
        if (type === "newGroup") await createGroup(activeTournament.id, values);
        if (type === "newPlayer") await createPlayer(values);
        if (type === "newMatch") await createMatch(activeTournament.id, values);
        if (type === "editMatch") await updateMatch(values.id, values);
        await refreshWorkspace(context.organization.id, activeTournament.id);
      }
      setModal(null); notify("Registro salvo no Supabase");
    } catch (error) {
      notify(error.message || "Não foi possível salvar.");
    }
  };
  const assignGroup = async (teamId, groupId) => {
    try {
      await assignTeamToGroup(teamId, groupId);
      await refreshWorkspace(context.organization.id, activeTournament.id);
      notify("Equipe distribuída no grupo");
    } catch {
      notify("Não foi possível alterar o grupo.");
    }
  };
  const generatePhaseTwo = async () => {
    const groupPosition = group => {
      const number = group.name.match(/\d+/)?.[0];
      if (number) return Number(number);
      const letter = group.name.trim().match(/([A-H])$/i)?.[1];
      return letter ? letter.toUpperCase().charCodeAt(0)-64 : Number(group.sort_order)+1;
    };
    const firstPhaseGroups = groupRows.filter(group => Number(group.phase_number || 1) === 1).sort((a,b) => groupPosition(a)-groupPosition(b));
    if (firstPhaseGroups.length !== 8 || firstPhaseGroups.some((group,index)=>groupPosition(group)!==index+1)) {
      notify("A primeira fase precisa ter os grupos 1 a 8 (ou A a H).");
      return;
    }
    const rankings = [];
    for (const group of firstPhaseGroups) {
      const memberIds = new Set((group.group_teams?.length ? group.group_teams.map(item=>item.team_id) : teamRows.filter(team=>team.group_id===group.id).map(team=>team.id)));
      const members = teamRows.filter(team=>memberIds.has(team.id));
      const groupMatches = matches.filter(match => match.groupId===group.id || (!match.groupId && memberIds.has(match.homeTeamId) && memberIds.has(match.awayTeamId) && !String(match.phase).toLowerCase().includes("2º fase")));
      if (members.length < 2 || !groupMatches.length || groupMatches.some(match=>match.status!=="Encerrada")) {
        notify(`Finalize as partidas de ${group.name} antes de gerar a segunda fase.`);
        return;
      }
      const ranking = buildStandings(members,groupMatches);
      if (ranking[0]?.j === 0 || ranking[1]?.j === 0) {
        notify(`Não há resultados suficientes em ${group.name}.`);
        return;
      }
      rankings.push(ranking);
    }
    const assignments = [
      [rankings[0][0],rankings[4][0],rankings[1][1],rankings[2][1]],
      [rankings[1][0],rankings[5][0],rankings[6][1],rankings[7][1]],
      [rankings[2][0],rankings[6][0],rankings[3][1],rankings[5][1]],
      [rankings[3][0],rankings[7][0],rankings[0][1],rankings[4][1]]
    ].map(rows=>({team_ids:rows.map(row=>row.id)}));
    if (!window.confirm("Gerar os quatro grupos da 2º fase com os classificados atuais?\n\nSe eles já existirem, serão atualizados.")) return;
    try {
      await generateSecondPhase(activeTournament.id,assignments);
      await refreshWorkspace(context.organization.id,activeTournament.id);
      notify("Grupos da 2º fase gerados com sucesso");
    } catch (error) {
      notify(error.message || "Não foi possível gerar a 2º fase.");
    }
  };
  const publish = async tournamentId => {
    try {
      await publishTournament(tournamentId);
      const link = `${window.location.origin}/?public=${tournamentId}`;
      await navigator.clipboard.writeText(link);
      await refreshWorkspace(context.organization.id, tournamentId);
      notify("Torneio publicado e link copiado");
    } catch {
      notify("Não foi possível publicar o torneio.");
    }
  };
  const deleteUser = async membership => {
    const name = membership.profile?.full_name || membership.profile?.email || "este usuário";
    if (!window.confirm(`Excluir o acesso de ${name}?\n\nEssa pessoa não poderá mais entrar no sistema.`)) return;
    try {
      await deleteOrganizationUser(context.organization.id, membership.id, session.user.id);
      await refreshWorkspace(context.organization.id, activeTournament?.id);
      notify("Usuário excluído com sucesso");
    } catch (error) {
      notify(error.message || "Não foi possível excluir o usuário.");
    }
  };
  const saveUserRoles = async (membership, roles, fullName) => {
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          organization_id: context.organization.id,
          membership_id: membership.id,
          user_id: membership.user_id,
          full_name: fullName,
          roles
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar o usuário.");
      await refreshWorkspace(context.organization.id, activeTournament?.id);
      setModal(null);
      notify("Usuário atualizado com sucesso");
    } catch (error) {
      notify(error.message || "Não foi possível atualizar o usuário.");
    }
  };
  const deleteRecord = async (type, record) => {
    const settings = {
      player: { name: record.full_name, warning: "O jogador será removido da equipe.", action: () => deletePlayer(record.id), success: "Jogador excluído com sucesso" },
      group: { name: record.name, warning: "As equipes deste grupo não serão apagadas; elas ficarão como “Sem grupo” para uma nova distribuição.", action: () => deleteGroup(record.id), success: "Grupo excluído com sucesso" },
      team: { name: record.name, warning: "Os jogadores e todas as partidas vinculadas a esta equipe também serão excluídos.", action: () => deleteTeam(record.id), success: "Equipe excluída com sucesso" },
      tournament: { name: record.name, warning: "Equipes, jogadores, grupos, partidas, placares e súmulas deste torneio também serão excluídos.", action: () => deleteTournament(record.id), success: "Torneio excluído com sucesso" }
    }[type];
    if (!settings || !window.confirm(`Excluir “${settings.name}”?\n\n${settings.warning}\n\nEsta ação não pode ser desfeita.`)) return;
    try {
      await settings.action();
      await refreshWorkspace(context.organization.id, type === "tournament" ? undefined : activeTournament?.id);
      notify(settings.success);
    } catch (error) {
      notify(error.message || "Não foi possível realizar a exclusão.");
    }
  };
  const saveTeamPlayer = async (values, player) => {
    try {
      if (player) await updatePlayer(player.id, values);
      else await createPlayer(values);
      await refreshWorkspace(context.organization.id, activeTournament?.id);
      notify(player ? "Jogador atualizado com sucesso" : "Jogador incluído na equipe");
      return true;
    } catch (error) {
      notify(error.message || "Não foi possível salvar o jogador.");
      return false;
    }
  };
  const saveRefereeAssignment = async (values, assignment) => {
    try {
      if (assignment) await updateMatchReferee(assignment.id, values);
      else await createMatchReferee(values);
      await refreshWorkspace(context.organization.id, activeTournament?.id);
      setModal(null);
      notify(assignment ? "Escala atualizada com sucesso" : "Árbitro incluído na escala");
    } catch (error) {
      notify(error.message || "Não foi possível salvar a escala.");
    }
  };
  const removeRefereeAssignment = async assignment => {
    if (!window.confirm(`Retirar ${assignment.referee_name} desta partida?`)) return;
    try {
      await deleteMatchReferee(assignment.id);
      await refreshWorkspace(context.organization.id, activeTournament?.id);
      notify("Árbitro retirado da escala");
    } catch (error) {
      notify(error.message || "Não foi possível retirar o árbitro.");
    }
  };
  const notify = text => { setToast(text); setTimeout(() => setToast(""), 2600); };
  const title = menu.find(x => x[0] === page)?.[1] || "Visão geral";
  const roleKeys = context?.roles?.length ? context.roles : [context?.role].filter(Boolean);
  const hasRole = value => roleKeys.includes(value);
  const canManage = hasRole("admin") || hasRole("professor");
  const canManagePlayers = canManage || hasRole("treinador");
  const canScore = canManage || hasRole("arbitro");
  const visibleMenu = menu.filter(([key]) => key !== "users" || hasRole("admin"));

  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <button className="brand" onClick={() => setPage("dashboard")}>
          <span className="brand-mark">Q</span><span>Queima<span>Fácil</span></span>
        </button>
        <div className="season-label">TEMPORADA 2026</div>
        <nav>
          {visibleMenu.map(([key, label]) => (
            <button key={key} className={page === key ? "nav-item active" : "nav-item"} onClick={() => { setPage(key); setMobile(false); }}>
              <span className="nav-icon">{icons[key]}</span>{label}
              {key === "matches" && <span className="nav-badge">3</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item"><span className="nav-icon">{icons.settings}</span>Configurações</button>
          <div className="help-card">
            <span className="help-icon">?</span>
            <strong>Precisa de ajuda?</strong>
            <small>Acesse o guia rápido do sistema.</small>
            <button onClick={() => notify("Central de ajuda aberta")}>Ver guia</button>
          </div>
          <div className="user-card">
            <div className="avatar">MC</div>
            <div><strong>{account.name}</strong><small>{role}</small></div>
            <button onClick={() => setModal({ type: "profile", email: session.user.email })}>•••</button>
          </div>
        </div>
      </aside>

      <main>
        <header>
          <button className="hamburger" onClick={() => setMobile(!mobile)}>☰</button>
          <div className="header-copy"><h1>{title}</h1><p>Olá, {account.name}! Aqui está o resumo da {account.organization}.</p></div>
          <div className="header-actions">
            <label className="search"><span>⌕</span><input placeholder="Buscar no sistema..." /></label>
            <button className="icon-btn" aria-label="Notificações">♢<i>3</i></button>
            <select
              value={activeTournament?.id || ""}
              onChange={event => refreshWorkspace(context.organization.id, event.target.value)}
              aria-label="Selecionar torneio"
            >
              {!tournaments.length && <option value="">Nenhum torneio cadastrado</option>}
              {tournaments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </header>

        <div className="content">
          {page === "dashboard" && (activeTournament ? <Dashboard matches={matches} teams={teamRows} players={playerRows} classification={classification} setPage={setPage} setModal={setModal} canScore={canScore} canManage={canManage} /> : <Onboarding setModal={setModal} canManage={canManage} />)}
          {page === "matches" && <Matches matches={matches} setModal={setModal} canManage={canManage} canScore={canScore} canEdit={hasRole("admin")} />}
          {page === "standings" && <Standings full rows={classification} teams={teamRows} matches={matches} groups={groupRows} />}
          {page === "referees" && <RefereeSchedule matches={matches} assignments={refereeRows} setModal={setModal} canEdit={hasRole("admin")} onDelete={removeRefereeAssignment} />}
          {page === "teams" && <Teams rows={teamRows} players={playerRows} setModal={setModal} canManage={canManage} canDelete={hasRole("admin")} onDelete={item => deleteRecord("team", item)} />}
          {page === "groups" && <Groups rows={groupRows} teams={teamRows} setModal={setModal} onAssign={assignGroup} onGenerateSecondPhase={generatePhaseTwo} canManage={canManage} canDelete={hasRole("admin")} onDelete={item=>deleteRecord("group",item)} />}
          {page === "tournaments" && <Tournaments rows={tournaments} active={activeTournament} onPublish={publish} setPage={setPage} setModal={setModal} canManage={canManage} canDelete={hasRole("admin")} onDelete={item => deleteRecord("tournament", item)} />}
          {page === "players" && <Players rows={playerRows} setModal={setModal} canManage={canManagePlayers} canDelete={hasRole("admin")} onDelete={item => deleteRecord("player", item)} />}
          {page === "reports" && <Reports matches={matches} audit={auditRows} setModal={setModal} notify={notify} />}
          {page === "regulations" && <Regulations />}
          {page === "users" && hasRole("admin") && <Users rows={userRows} invitations={invitationRows} setModal={setModal} onDelete={deleteUser} currentUserId={session.user.id} />}
        </div>
      </main>
      {modal && <Modal data={modal} close={() => setModal(null)} saveScore={saveScore} saveRecord={saveRecord} saveUserRoles={saveUserRoles} saveTeamPlayer={saveTeamPlayer} saveRefereeAssignment={saveRefereeAssignment} deletePlayerRecord={item => deleteRecord("player", item)} teams={teamRows} groups={groupRows} matches={matches} players={playerRows} notify={notify} setRole={setRole} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}

function mapMatch(match) {
  const when = match.scheduled_at ? new Date(match.scheduled_at) : null;
  const parts = when ? tournamentDateParts(when) : null;
  return {
    id: match.id,
    dateKey: when ? `${parts.year}-${parts.month}-${parts.day}` : "sem-data",
    date: when ? when.toLocaleDateString("pt-BR", { timeZone: TOURNAMENT_TIME_ZONE }) : "Data a definir",
    dateLong: when ? when.toLocaleDateString("pt-BR", { timeZone: TOURNAMENT_TIME_ZONE, weekday:"long", day:"2-digit", month:"long", year:"numeric" }) : "Data a definir",
    time: when ? when.toLocaleTimeString("pt-BR", { timeZone: TOURNAMENT_TIME_ZONE, hour: "2-digit", minute: "2-digit" }) : "A definir",
    court: match.court || "Quadra a definir",
    round: `${match.group?.name || match.phase}${match.round_number ? ` · Rodada ${match.round_number}` : ""}`,
    a: match.home_team?.name || "Equipe A",
    b: match.away_team?.name || "Equipe B",
    sa: match.home_score,
    sb: match.away_score,
    burnedA: match.home_burned ?? 0,
    burnedB: match.away_burned ?? 0,
    status: { agendada: "Agendada", em_andamento: "Próxima", encerrada: "Encerrada", cancelada: "Cancelada" }[match.status],
    ca: match.home_team?.color || "#ff6945",
    cb: match.away_team?.color || "#6547d9",
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    groupId: match.group_id,
    phase: match.phase || "Fase de grupos",
    scheduledAt: when ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : ""
  };
}

function buildStandings(teamRows, matchRows) {
  const table = new Map(teamRows.map(team => [team.id, {
    p: 0, team: team.name, tag: team.short_name || team.name.slice(0,3).toUpperCase(),
    id: team.id, pts: 0, j: 0, v: 0, e: 0, d: 0, burnedFor: 0, burnedAgainst: 0,
    color: team.color || "#ff6945"
  }]));
  const finished = matchRows.filter(match => match.status === "Encerrada");
  finished.forEach(match => {
    const home = table.get(match.homeTeamId), away = table.get(match.awayTeamId);
    if (!home || !away) return;
    home.j++; away.j++;
    home.burnedFor += Number(match.burnedA || 0); home.burnedAgainst += Number(match.burnedB || 0);
    away.burnedFor += Number(match.burnedB || 0); away.burnedAgainst += Number(match.burnedA || 0);
    if (match.sa > match.sb) { home.v++; away.d++; home.pts += 3; }
    else if (match.sb > match.sa) { away.v++; home.d++; away.pts += 3; }
    else { home.e++; away.e++; home.pts++; away.pts++; }
  });
  const rows = [...table.values()];
  const headToHead = (a, b) => {
    const match = finished.find(item =>
      (item.homeTeamId === a.id && item.awayTeamId === b.id) ||
      (item.homeTeamId === b.id && item.awayTeamId === a.id)
    );
    if (!match || Number(match.sa) === Number(match.sb)) return 0;
    const winnerId = Number(match.sa) > Number(match.sb) ? match.homeTeamId : match.awayTeamId;
    return winnerId === a.id ? -1 : 1;
  };
  const pointGroups = new Map();
  rows.forEach(row => pointGroups.set(row.pts, [...(pointGroups.get(row.pts) || []), row]));
  const ordered = [...pointGroups.entries()].sort((a,b) => b[0]-a[0]).flatMap(([, tied]) =>
    tied.sort((a,b) => {
      const direct = tied.length === 2 ? headToHead(a,b) : 0;
      return direct || b.burnedFor-a.burnedFor || a.burnedAgainst-b.burnedAgainst || a.team.localeCompare(b.team);
    })
  );
  return ordered.map((row,index) => ({ ...row, p:index+1 }));
}

function PublicDashboard({ tournamentId }) {
  const [data, setData] = useState(undefined);
  const [error, setError] = useState("");
  useEffect(() => {
    getPublicTournament(tournamentId)
      .then(result => setData(result))
      .catch(() => setError("Não foi possível carregar os resultados."));
  }, [tournamentId]);
  if (error) return <div className="public-message"><h1>QueimaFácil</h1><p>{error}</p></div>;
  if (data === undefined) return <div className="auth-loading"><span className="brand-mark">Q</span><p>Carregando resultados…</p></div>;
  if (!data) return <div className="public-message"><h1>Torneio indisponível</h1><p>O torneio ainda não foi publicado ou o link não é válido.</p></div>;
  const matchRows = data.matches.map(mapMatch);
  const ranking = buildStandings(data.teams, matchRows);
  return <main className="public-page">
    <header className="public-header"><div className="login-brand"><span className="brand-mark">Q</span><strong>Queima<span>Fácil</span></strong></div><span>RESULTADOS OFICIAIS · COORDEDF</span></header>
    <section className="public-hero"><span className="status encerrada">● AO VIVO</span><h1>{data.tournament.name}</h1><p>{data.tournament.category || "Torneio de queimada"} · {data.tournament.venue || "Local a definir"}</p></section>
    <div className="public-content"><section><div className="section-row"><div><h2>Partidas</h2><p>Calendário e resultados atualizados</p></div></div>{matchRows.length ? <div className="match-grid">{matchRows.map(match => <MatchCard key={match.id} match={match} onScore={()=>{}} />)}</div> : <div className="inline-empty">Nenhuma partida agendada.</div>}</section>
    <section className="panel public-ranking"><div className="panel-title"><div><h2>Classificação</h2><p>Atualizada automaticamente</p></div></div><Standings rows={ranking}/></section></div>
    <footer className="public-footer">Resultados oficiais publicados pela CoordEDF · Atualize a página para ver as novidades</footer>
  </main>;
}

function LoginScreen() {
  const [inviteToken, setInviteToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setInviteToken(new URLSearchParams(window.location.search).get("invite") || "");
  }, []);

  const login = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password });
    if (authError) setError("E-mail ou senha inválidos.");
    setBusy(false);
  };

  const resetPassword = async () => {
    if (!email) {
      setError("Digite seu e-mail para recuperar a senha.");
      return;
    }
    setBusy(true);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`
    });
    setError(resetError ? "Não foi possível enviar a recuperação." : "Enviamos as instruções para o seu e-mail.");
    setBusy(false);
  };

  const signup = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    const { data, error: signupError } = await createClient().auth.signUp({
      email, password, options: { data: { full_name: fullName } }
    });
    if (signupError) {
      setError(signupError.message.includes("already") ? "Este e-mail já possui uma conta. Entre normalmente." : "Não foi possível criar a conta.");
    } else if (data.session) {
      try {
        await claimInvitation(inviteToken);
        window.location.reload();
      } catch { setError("Conta criada, mas o convite não pôde ser aceito."); }
    } else {
      setError("Conta criada. Confirme o e-mail e volte a abrir o link do convite.");
    }
    setBusy(false);
  };

  return <main className="login-page">
    <section className="login-visual">
      <div className="login-brand"><span className="brand-mark">Q</span><strong>Queima<span>Fácil</span></strong></div>
      <div>
        <span className="eyebrow light">GESTÃO DE TORNEIOS</span>
        <h1>Organize cada jogada.<br />Celebre cada vitória.</h1>
        <p>Equipes, partidas, placares, classificação e súmulas em um único lugar.</p>
      </div>
      <small>Seguro · Intuitivo · Em tempo real</small>
    </section>
    <section className="login-form-area">
      <form className="login-form" onSubmit={inviteToken ? signup : login}>
        <span className="mobile-login-brand">QueimaFácil</span>
        <h2>{inviteToken ? "Aceitar convite" : "Bem-vindo de volta"}</h2>
        <p>{inviteToken ? "Crie sua conta para entrar na equipe CoordEDF." : "Entre com sua conta para acessar o torneio."}</p>
        {inviteToken && <label>Nome completo<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome" autoFocus /></label>}
        <label>E-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@escola.com.br" autoFocus /></label>
        <label>{inviteToken ? "Crie uma senha" : "Senha"}<input type="password" minLength="8" required value={password} onChange={e => setPassword(e.target.value)} placeholder={inviteToken ? "Mínimo de 8 caracteres" : "Sua senha"} /></label>
        {error && <div className={error.startsWith("Enviamos") ? "auth-message success" : "auth-message"}>{error}</div>}
        <button className="login-submit" disabled={busy}>{busy ? "Aguarde…" : inviteToken ? "Criar conta e aceitar convite" : "Entrar no sistema"}</button>
        {!inviteToken && <button type="button" className="forgot-password" onClick={resetPassword}>Esqueci minha senha</button>}
        <small>{inviteToken ? "O convite será validado pelo Supabase." : "O acesso é concedido pelo administrador do torneio."}</small>
      </form>
    </section>
  </main>;
}

function ForcePasswordChange({ session, onComplete }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) return setError("A nova senha deve ter pelo menos 8 caracteres.");
    if (newPassword !== confirmation) return setError("A confirmação não corresponde à nova senha.");
    if (newPassword === currentPassword) return setError("A nova senha deve ser diferente da senha temporária.");
    setBusy(true);
    const supabase = createClient();
    const { error: validationError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword
    });
    if (validationError) {
      setError("A senha temporária informada está incorreta.");
      setBusy(false);
      return;
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });
    if (passwordError) {
      setError("Não foi possível salvar a nova senha.");
      setBusy(false);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const response = await fetch("/api/auth/password-changed", {
      method: "POST",
      headers: { Authorization: `Bearer ${sessionData.session?.access_token || session.access_token}` }
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error || "A senha mudou, mas o acesso ainda não pôde ser liberado. Tente novamente.");
      setBusy(false);
      return;
    }
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      await supabase.auth.signOut();
      return;
    }
    onComplete(refreshed.session);
  };

  return <main className="login-page">
    <section className="login-visual">
      <div className="login-brand"><span className="brand-mark">Q</span><strong>Queima<span>Fácil</span></strong></div>
      <div><span className="eyebrow light">PRIMEIRO ACESSO</span><h1>Crie sua senha pessoal.</h1><p>Este procedimento acontece somente uma vez e libera seu acesso ao torneio.</p></div>
      <small>Senha pessoal · Acesso protegido</small>
    </section>
    <section className="login-form-area">
      <form className="login-form" onSubmit={submit}>
        <span className="mobile-login-brand">QueimaFácil</span>
        <h2>Troca obrigatória de senha</h2>
        <p>Olá, {session.user.user_metadata?.full_name || session.user.email}. Substitua a senha temporária recebida do administrador.</p>
        <label>Senha temporária<input type="password" required value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} autoFocus /></label>
        <label>Nova senha<input type="password" required minLength="8" value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" /></label>
        <label>Confirme a nova senha<input type="password" required minLength="8" value={confirmation} onChange={event=>setConfirmation(event.target.value)} /></label>
        {error && <div className="auth-message">{error}</div>}
        <button className="login-submit" disabled={busy}>{busy ? "Salvando…" : "Trocar senha e entrar"}</button>
        <small>Depois da troca, use somente a sua nova senha.</small>
      </form>
    </section>
  </main>;
}

function Onboarding({ setModal, canManage = true }) {
  return <section className="empty-state">
    <div className="empty-icon">🏆</div>
    <span className="eyebrow">PRIMEIROS PASSOS</span>
    <h2>Crie o primeiro torneio da CoordEDF</h2>
    <p>A partir dele, você poderá cadastrar equipes, jogadores, partidas e resultados reais.</p>
    {canManage ? <button className="primary-btn" onClick={() => setModal({ type: "newTournament" })}>＋ Criar primeiro torneio</button> : <p>Aguarde um administrador criar o primeiro torneio.</p>}
  </section>;
}

function Dashboard({ matches, teams, players, classification, setPage, setModal, canScore, canManage }) {
  return <>
    <section className="stats-grid">
      <Stat icon="🏆" label="Equipes inscritas" value={teams.length} note="Dados do Supabase" tone="orange" />
      <Stat icon="♙" label="Atletas" value={players.length} note={`${teams.length} equipes`} tone="purple" />
      <Stat icon="◎" label="Partidas realizadas" value={matches.filter(m => m.status === "Encerrada").length} note={`de ${matches.length} partidas`} tone="teal" progress={matches.length ? Math.round(matches.filter(m => m.status === "Encerrada").length / matches.length * 100) : 0} />
      <Stat icon="◷" label="Próxima partida" value={matches.find(m => m.status !== "Encerrada")?.time || "—"} note={matches.find(m => m.status !== "Encerrada")?.court || "Nenhuma agendada"} tone="blue" />
    </section>
    <section className="section-row">
      <div><h2>Partidas de hoje</h2><p>Acompanhe os jogos e atualize os placares</p></div>
      <button className="text-button" onClick={() => setPage("matches")}>Ver todas as partidas →</button>
    </section>
    {matches.length ? <div className="match-grid">{matches.slice(0,3).map(m => <MatchCard key={m.id} match={m} onScore={() => setModal({ type: "score", match: m })} canScore={canScore} />)}</div> : <div className="inline-empty">Nenhuma partida agendada. {canManage && <button onClick={() => setModal({ type: "newMatch" })}>Agendar primeira partida</button>}</div>}
    <div className="bottom-grid">
      <section className="panel standings-panel">
        <div className="panel-title"><div><h2>Classificação geral</h2><p>Fase de grupos · Atualizada agora</p></div><button className="more">•••</button></div>
        <Standings rows={classification} />
        <button className="full-link" onClick={() => setPage("standings")}>Ver classificação completa →</button>
      </section>
      <section className="panel activity-panel">
        <div className="panel-title"><div><h2>Atividade recente</h2><p>Últimas atualizações do torneio</p></div></div>
        <Activity icon="✓" tone="green" title="Placar atualizado" text="Falcões 2 × 1 Titãs" time="Há 12 minutos" />
        <Activity icon="♙" tone="purple" title="Novo atleta inscrito" text="Lucas Mendes · Tempestade" time="Há 45 minutos" />
        <Activity icon="▤" tone="blue" title="Súmula gerada" text="Águias × Vikings · Rodada 3" time="Há 1 hora" />
        <Activity icon="◷" tone="orange" title="Horário alterado" text="Semifinal 1 · 16:30" time="Há 2 horas" />
        <button className="full-link">Ver todas as atividades →</button>
      </section>
    </div>
  </>;
}

function Stat({ icon, label, value, note, tone, progress }) {
  return <div className="stat-card">
    <div className={`stat-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    {progress && <div className="progress"><i style={{ width: `${progress}%` }} /></div>}
  </div>;
}

function MatchCard({ match, onScore, onEdit, canScore = false, canEdit = false }) {
  return <article className="match-card">
    <div className="match-top"><span className={`status ${match.status.toLowerCase()}`}>{match.status === "Encerrada" ? "✓ " : ""}{match.status}</span><span>{match.date} · {match.time} · {match.court}</span><button>•••</button></div>
    <div className="round">{match.round}</div>
    <div className="versus">
      <TeamMark name={match.a} color={match.ca} /><div className="score">{match.sa ?? "–"} <small>×</small> {match.sb ?? "–"}</div><TeamMark name={match.b} color={match.cb} />
    </div>
    <div className="match-actions">
      {canEdit && <button onClick={onEdit}>Editar partida</button>}
      {match.status === "Encerrada" ? <>{canScore && <button onClick={onScore}>Editar placar</button>}</> : canScore && <button className={match.status === "Próxima" ? "primary" : ""} onClick={onScore}>{match.status === "Próxima" ? "Inserir placar" : "Ver detalhes"}</button>}
    </div>
  </article>;
}

function TeamMark({ name, color }) {
  return <div className="team-mark"><span style={{ background: color }}>{name.slice(0, 2).toUpperCase()}</span><strong>{name}</strong></div>;
}

function Standings({ full = false, rows = [], teams = [], matches = [], groups = [] }) {
  const [groupFilter,setGroupFilter]=useState("");
  const selectedGroup=groups.find(group=>group.id===groupFilter);
  const selectedMemberIds=new Set(selectedGroup?.group_teams?.length ? selectedGroup.group_teams.map(item=>item.team_id) : teams.filter(team=>team.group_id===groupFilter).map(team=>team.id));
  const displayedRows=groupFilter ? buildStandings(teams.filter(team=>selectedMemberIds.has(team.id)),matches.filter(match=>match.groupId===groupFilter || (!match.groupId && selectedMemberIds.has(match.homeTeamId) && selectedMemberIds.has(match.awayTeamId)))) : rows;
  return <div className={full ? "panel full-panel" : ""}>
    {full && <div className="page-tools"><div><h2>{groupFilter ? `Classificação — ${groups.find(group=>group.id===groupFilter)?.name||"Grupo"}` : "Classificação geral"}</h2><p>Desempate: confronto direto (2 equipes), queimados a favor e queimados contra</p></div><select value={groupFilter} onChange={event=>setGroupFilter(event.target.value)} aria-label="Filtrar classificação por grupo"><option value="">Classificação geral</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></div>}
    <div className="table-wrap"><table><thead><tr><th>#</th><th>Equipe</th><th>PTS</th><th>J</th><th>V</th><th>E</th><th>D</th><th>QF</th><th>QC</th></tr></thead>
      <tbody>{displayedRows.map(r => <tr key={r.team}><td><span className={r.p <= 2 ? "rank top" : "rank"}>{r.p}</span></td><td><div className="table-team"><span style={{ background: r.color }}>{r.tag}</span><strong>{r.team}</strong></div></td><td><b>{r.pts}</b></td><td>{r.j}</td><td>{r.v}</td><td>{r.e}</td><td>{r.d}</td><td>{r.burnedFor}</td><td>{r.burnedAgainst}</td></tr>)}</tbody>
    </table></div>
    {!displayedRows.length && <div className="inline-empty">{groupFilter ? "Nenhuma equipe cadastrada neste grupo." : "Cadastre equipes para iniciar a classificação."}</div>}
  </div>;
}

function Activity({ icon, tone, title, text, time }) {
  return <div className="activity"><span className={tone}>{icon}</span><div><strong>{title}</strong><p>{text}</p><small>{time}</small></div></div>;
}

function Matches({ matches, setModal, canManage, canScore, canEdit }) {
  const datedGroups = new Map();
  [...matches].sort((a,b)=>{
    if(a.dateKey==="sem-data" && b.dateKey==="sem-data") return 0;
    if(a.dateKey==="sem-data") return 1;
    if(b.dateKey==="sem-data") return -1;
    return a.dateKey.localeCompare(b.dateKey) || a.time.localeCompare(b.time);
  }).forEach(match=>{
    if(!datedGroups.has(match.dateKey)) datedGroups.set(match.dateKey,{label:match.dateLong,rows:[]});
    datedGroups.get(match.dateKey).rows.push(match);
  });
  return <section className="panel full-panel">
    <div className="page-tools"><div><h2>Tabela de partidas</h2><p>Organize horários, quadras e resultados</p></div><div className="tool-actions"><select><option>Todas as rodadas</option><option>Rodada 3</option></select>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newMatch" })}>＋ Nova partida</button>}</div></div>
    {[...datedGroups.entries()].map(([dateKey,group])=><section className="match-date-group" key={dateKey}><div className="match-date-heading"><span>◷</span><div><strong>{group.label}</strong><small>{group.rows.length} {group.rows.length===1?"partida":"partidas"}</small></div></div><div className="match-list">{group.rows.map(m => <MatchCard key={m.id} match={m} onScore={() => setModal({ type: "score", match: m })} onEdit={() => setModal({ type: "editMatch", match: m })} canScore={canScore} canEdit={canEdit} />)}</div></section>)}
    {!matches.length && <div className="inline-empty">Nenhuma partida agendada.</div>}
  </section>;
}

function RefereeSchedule({ matches, assignments, setModal, canEdit, onDelete }) {
  const ordered=[...matches].sort((a,b)=>{
    if(a.dateKey==="sem-data"&&b.dateKey==="sem-data") return a.time.localeCompare(b.time);
    if(a.dateKey==="sem-data") return 1;
    if(b.dateKey==="sem-data") return -1;
    return a.dateKey.localeCompare(b.dateKey)||a.time.localeCompare(b.time);
  });
  return <section className="panel full-panel"><div className="page-tools"><div><h2>Escala de árbitros</h2><p>Árbitros e escolas responsáveis por cada partida</p></div></div>
    <div className="referee-schedule">{ordered.map(match=>{const matchAssignments=assignments.filter(item=>item.match_id===match.id);return <article className="referee-match" key={match.id}>
      <div className="referee-match-info"><span className="status agendada">{match.date}</span><h3>{match.a} × {match.b}</h3><p>{match.time} · {match.court} · {match.phase}</p>{canEdit&&<button className="primary-btn" onClick={()=>setModal({type:"refereeAssignment",match})}>＋ Escalar árbitro</button>}</div>
      <div className="assigned-referees">{matchAssignments.map((assignment,index)=><div className="assigned-referee" key={assignment.id}><span>{index+1}</span><div><strong>{assignment.referee_name}</strong><small>{assignment.assignment_role} · {assignment.school_name}</small></div>{canEdit&&<div><button onClick={()=>setModal({type:"refereeAssignment",match,assignment})}>Editar</button><button className="delete-record" onClick={()=>onDelete(assignment)}>Retirar</button></div>}</div>)}{!matchAssignments.length&&<div className="referee-empty">Nenhum árbitro escalado para esta partida.</div>}</div>
    </article>})}</div>
    {!ordered.length&&<div className="inline-empty">Cadastre partidas para montar a escala de árbitros.</div>}
  </section>;
}

function Teams({ rows, players, setModal, canManage, canDelete, onDelete }) {
  return <><div className="page-tools"><div><h2>Equipes inscritas</h2><p>{rows.length} equipes cadastradas no torneio</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newTeam" })}>＋ Nova equipe</button>}</div>
    {rows.length ? <div className="team-grid">{rows.map(t => {const total=players.filter(player=>player.team_id===t.id).length; return <article className="team-card" key={t.id}><div className="big-team-mark" style={{ background: t.color || "#ff6945" }}>{(t.short_name || t.name.slice(0, 2)).toUpperCase()}</div><div><span className="group-tag">{t.group?.name || "SEM GRUPO"}</span><h3>{t.name}</h3><p>{t.coach_name || "Professor não informado"}</p></div><div className="team-meta"><span>{total} {total===1 ? "jogador inscrito" : "jogadores inscritos"}</span><div><button onClick={()=>setModal({type:"teamDetails",team:t,canEdit:canDelete})}>Ver detalhes →</button>{canDelete && <button onClick={()=>setModal({type:"editTeam",team:t})}>Editar</button>}{canDelete && <button className="delete-record" onClick={() => onDelete(t)}>Excluir</button>}</div></div></article>})}</div> : <div className="inline-empty">Nenhuma equipe cadastrada.</div>}</>;
}

function Groups({ rows, teams, setModal, onAssign, onGenerateSecondPhase, canManage, canDelete, onDelete }) {
  const firstPhase=rows.filter(group=>Number(group.phase_number||1)===1);
  const secondPhase=rows.filter(group=>Number(group.phase_number||1)===2);
  const GroupCards=({groups,phase}) => <>{groups.length>0&&<><div className="phase-heading"><div><span>{phase===1?"PRIMEIRA FASE":"SEGUNDA FASE"}</span><h2>{phase===1?"Grupos classificatórios":"Grupos gerados pelos classificados"}</h2></div><strong>{groups.length} grupos</strong></div><div className="group-grid">{groups.map(group => {
    const memberIds=new Set(group.group_teams?.length ? group.group_teams.map(item=>item.team_id) : teams.filter(team=>team.group_id===group.id).map(team=>team.id));
    const members=teams.filter(team=>memberIds.has(team.id));
    return <section className="panel group-panel" key={group.id}><div className="panel-title"><div><span className="group-tag">{phase===1?"GRUPO":"2º FASE"}</span><h2>{group.name}</h2></div><div className="group-heading-actions"><strong>{members.length} equipes</strong>{canDelete&&<button className="delete-record" onClick={()=>onDelete(group)}>Excluir grupo</button>}</div></div>{members.map(team => <div className="group-team" key={team.id}><span style={{background:team.color || "#ff6945"}}>{(team.short_name || team.name.slice(0,2)).toUpperCase()}</span><strong>{team.name}</strong>{phase===1&&canManage&&<button onClick={() => onAssign(team.id, "")}>Remover</button>}</div>)}{!members.length && <p className="group-empty">Nenhuma equipe neste grupo.</p>}</section>;
  })}</div></>}</>;
  return <>
    <div className="page-tools"><div><h2>Grupos do torneio</h2><p>Organize a primeira fase e gere a segunda pelos resultados</p></div>{canManage && <div className="tool-actions"><button onClick={onGenerateSecondPhase}>Gerar 2º fase</button><button className="primary-btn" onClick={() => setModal({ type: "newGroup" })}>＋ Novo grupo</button></div>}</div>
    {rows.length ? <><GroupCards groups={firstPhase} phase={1}/><GroupCards groups={secondPhase} phase={2}/></> : <div className="inline-empty">Crie o Grupo 1 até o Grupo 8 para iniciar a primeira fase.</div>}
    {!!teams.length && canManage && <section className="panel distribution-panel"><div className="panel-title"><div><h2>Distribuição da primeira fase</h2><p>Escolha o grupo inicial de cada equipe</p></div></div>{teams.map(team => <div className="distribution-row" key={team.id}><strong>{team.name}</strong><select value={team.group_id || ""} onChange={event => onAssign(team.id, event.target.value)}><option value="">Sem grupo</option>{firstPhase.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>)}</section>}
  </>;
}

function Tournaments({ rows, active, onPublish, setPage, setModal, canManage, canDelete, onDelete }) {
  return <><div className="page-tools"><div><h2>Seus torneios</h2><p>Crie, acompanhe e encerre competições</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newTournament" })}>＋ Novo torneio</button>}</div>
    {rows.length ? <div className="tournament-grid">{rows.map(item => <article className={item.id === active?.id ? "tournament-card featured" : "tournament-card"} key={item.id}><div className="trophy">🏆</div><span className={`status ${item.status === "em_andamento" ? "proxima" : "agendada"}`}>{item.status.replaceAll("_"," ").toUpperCase()}</span><h2>{item.name}</h2><p>{item.category || "Categoria não informada"} · {item.venue || "Local a definir"}</p><div className="tournament-numbers"><span><b>{item.starts_on ? new Date(`${item.starts_on}T12:00`).toLocaleDateString("pt-BR") : "—"}</b> início</span><span><b>{item.ends_on ? new Date(`${item.ends_on}T12:00`).toLocaleDateString("pt-BR") : "—"}</b> término</span></div><div className="tournament-actions"><button onClick={() => setPage("dashboard")}>Abrir torneio</button>{canManage && <button onClick={() => onPublish(item.id)}>{item.status === "em_andamento" ? "Copiar link público" : "Publicar resultados"}</button>}{canDelete && <button className="delete-record" onClick={() => onDelete(item)}>Excluir</button>}</div></article>)}</div> : <div className="inline-empty">Nenhum torneio criado.</div>}</>;
}

function Players({ rows, setModal, canManage, canDelete, onDelete }) {
  return <section className="panel full-panel"><div className="page-tools"><div><h2>Jogadores</h2><p>{rows.length} atletas cadastrados</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newPlayer" })}>＋ Novo jogador</button>}</div>
    <div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Equipe</th><th>Nascimento</th><th>Número</th><th>Categoria</th><th>Status</th>{canDelete && <th>Ações</th>}</tr></thead><tbody>{rows.map(player=><tr key={player.id}><td><div className="person"><span>{player.full_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><strong>{player.full_name}</strong></div></td><td>{player.team?.name}</td><td>{player.birth_date ? new Date(`${player.birth_date}T12:00:00`).toLocaleDateString("pt-BR") : "—"}</td><td>{player.shirt_number ? `#${String(player.shirt_number).padStart(2,"0")}` : "—"}</td><td>{player.category || "—"}</td><td><span className={player.active ? "status encerrada" : "status agendada"}>{player.active ? "✓ Apto" : "Inativo"}</span></td>{canDelete && <td><button className="delete-record" onClick={() => onDelete(player)}>Excluir</button></td>}</tr>)}</tbody></table></div></section>;
}

function Reports({ matches, audit, setModal }) {
  return <><div className="page-tools"><div><h2>Súmulas das partidas</h2><p>Documentos oficiais prontos para impressão ou PDF</p></div></div>
    {matches.length ? <div className="report-grid">{matches.map((m,i)=><article className="report-card" key={m.id}><div className="doc-icon">▤</div><div><span>SÚMULA #{String(i+1).padStart(4,"0")}</span><h3>{m.a} × {m.b}</h3><p>{m.round} · {m.time} · {m.court}</p></div><span className={`status ${m.status.toLowerCase()}`}>{m.status.toUpperCase()}</span><button onClick={() => setModal({type:"report",match:m,number:i+1})}>Visualizar</button></article>)}</div> : <div className="inline-empty">Agende uma partida para gerar a primeira súmula.</div>}
    <section className="panel audit-panel"><div className="panel-title"><div><h2>Histórico de alterações</h2><p>Últimas ações registradas no Supabase</p></div></div>{audit.length ? audit.map(item=><div className="audit-row" key={item.id}><span>✓</span><div><strong>{item.action.replaceAll("_"," ")}</strong><small>{item.entity_type} · {new Date(item.created_at).toLocaleString("pt-BR")}</small></div></div>) : <p className="group-empty">O histórico aparecerá após a próxima alteração de placar.</p>}</section>
  </>;
}

function Users({ rows, invitations, setModal, onDelete, currentUserId }) {
  const descriptions={admin:"Acesso total",professor:"Equipes e atletas",treinador:"Cadastra jogadores e visualiza o sistema",arbitro:"Partidas atribuídas",visualizador:"Somente resultados"};
  return <section className="panel full-panel"><div className="page-tools"><div><h2>Usuários e permissões</h2><p>{rows.length} usuários ativos na CoordEDF</p></div><button className="primary-btn" onClick={() => setModal({ type: "newUser" })}>＋ Criar usuário</button></div>
    <div className="user-list">{rows.map((item,i)=>{const name=item.profile?.full_name || "Nome não informado"; const initials=(item.profile?.full_name || item.profile?.email || "U").split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase(); const isCurrentUser=item.user_id===currentUserId; const roles=item.roles?.length ? item.roles : [item.role]; return <div className="user-row" key={item.id}><span className={`person-avatar c${i%3}`}>{initials}</span><div><strong>{name}{isCurrentUser && <em className="current-user">Você</em>}</strong><small>{item.profile?.email} · {roles.map(role=>descriptions[role]).join(" · ")}</small></div><div className="role-list">{roles.map(role=><span className={`role role${i%3}`} key={role}>{roleLabel(role)}</span>)}</div><span className="online">● {item.active ? "Ativo" : "Inativo"}</span>{isCurrentUser ? <span className="protected-user" title="Seu próprio acesso está protegido">Protegido</span> : <div className="user-actions"><button className="edit-roles" onClick={()=>setModal({type:"userRoles",membership:item})}>Editar usuário</button><button className="delete-user" onClick={()=>onDelete(item)} aria-label={`Excluir usuário ${name}`}>Excluir</button></div>}</div>})}</div>
    {!!invitations.filter(invite=>!invite.accepted_at).length && <div className="pending-invites"><h3>Convites pendentes</h3>{invitations.filter(invite=>!invite.accepted_at).map(invite=>{const roles=invite.roles?.length ? invite.roles : [invite.role]; return <div key={invite.id}><span>✉</span><div><strong>{invite.email}</strong><small>{roles.map(roleLabel).join(" + ")} · válido até {new Date(invite.expires_at).toLocaleDateString("pt-BR")}</small></div><button onClick={()=>navigator.clipboard.writeText(`${window.location.origin}/?invite=${invite.token}`)}>Copiar link</button></div>})}</div>}
    <div className="security-note"><span>🔒</span><div><strong>Acesso protegido pelo Supabase</strong><p>Cada pessoa cria a própria senha e recebe somente as permissões do perfil escolhido.</p></div></div>
  </section>;
}

const selectableRoles = [
  ["admin", "Administrador", "Acesso total ao sistema"],
  ["professor", "Professor", "Gerencia torneios, equipes e jogadores"],
  ["treinador", "Treinador", "Cadastra jogadores e visualiza o sistema"],
  ["arbitro", "Árbitro", "Registra placares das partidas"],
  ["visualizador", "Visualizador", "Consulta resultados e classificação"]
];

function UserRolesModal({ membership, close, save }) {
  const initialRoles = membership.roles?.length ? membership.roles : [membership.role];
  const [selected, setSelected] = useState(initialRoles);
  const [fullName, setFullName] = useState(membership.profile?.full_name || "");
  const name = membership.profile?.full_name || membership.profile?.email || "Usuário";
  const toggle = role => setSelected(current => current.includes(role) ? current.filter(item => item !== role) : [...current, role]);
  return <div className="modal-wrap"><div className="modal small">
    <button className="modal-close" onClick={close}>×</button>
    <span className="eyebrow">EDITAR USUÁRIO</span><h2>{name}</h2><p>Confira os dados cadastrados e atualize o nome ou as funções dessa pessoa.</p>
    <label>E-mail cadastrado<input value={membership.profile?.email || ""} readOnly className="readonly-field" /></label>
    <label>Nome completo<input value={fullName} onChange={event=>setFullName(event.target.value)} required autoFocus placeholder="Nome do usuário" /></label>
    <div className="role-checkboxes">{selectableRoles.map(([value,label,description])=><label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={()=>toggle(value)} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div>
    <div className="modal-actions"><button onClick={close}>Cancelar</button><button className="primary-btn" disabled={!selected.length || !fullName.trim()} onClick={()=>save(membership,selected,fullName.trim())}>Salvar usuário</button></div>
  </div></div>;
}

function TeamDetailsModal({ team, players, canEdit, close, savePlayer, deletePlayer }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const sortedPlayers = [...players].sort((a,b)=>a.full_name.localeCompare(b.full_name));
  return <div className="modal-wrap"><div className="modal team-details-modal">
    <button className="modal-close" onClick={close}>×</button>
    <div className="team-details-header"><div className="big-team-mark" style={{background:team.color||"#ff6945"}}>{(team.short_name||team.name.slice(0,2)).toUpperCase()}</div><div><span className="eyebrow">EQUIPE INSCRITA</span><h2>{team.name}</h2><p>{team.coach_name || "Professor não informado"} · {players.length} jogadores</p></div>{canEdit && <button className="primary-btn" onClick={()=>{setEditing(null);setAdding(true)}}>＋ Incluir jogador</button>}</div>
    {(adding || editing) && <TeamPlayerForm key={editing?.id || "new"} team={team} player={editing} onCancel={()=>{setAdding(false);setEditing(null)}} onSave={async values=>{const saved=await savePlayer(values,editing);if(saved){setAdding(false);setEditing(null)}}} />}
    <div className="team-roster">
      <div className="team-roster-head"><span>Jogador</span><span>Nascimento</span><span>Número</span><span>Categoria</span>{canEdit&&<span>Ações</span>}</div>
      {sortedPlayers.map(player=><div className="team-roster-row" key={player.id}><div className="person"><span>{player.full_name.split(" ").map(part=>part[0]).join("").slice(0,2)}</span><strong>{player.full_name}</strong></div><span>{player.birth_date?new Date(`${player.birth_date}T12:00:00`).toLocaleDateString("pt-BR"):"—"}</span><span>{player.shirt_number?`#${String(player.shirt_number).padStart(2,"0")}`:"—"}</span><span>{player.category||"—"}</span>{canEdit&&<div className="roster-actions"><button onClick={()=>{setAdding(false);setEditing(player)}}>Editar</button><button className="delete-record" onClick={()=>deletePlayer(player)}>Excluir</button></div>}</div>)}
      {!sortedPlayers.length && <div className="inline-empty">Nenhum jogador inscrito nesta equipe.</div>}
    </div>
  </div></div>;
}

function TeamPlayerForm({ team, player, onCancel, onSave }) {
  const [busy,setBusy]=useState(false);
  const submit=async event=>{event.preventDefault();setBusy(true);const values=Object.fromEntries(new FormData(event.currentTarget).entries());values.team_id=team.id;await onSave(values);setBusy(false)};
  return <form className="team-player-form" onSubmit={submit}>
    <div className="form-title"><strong>{player?"Editar jogador":"Incluir jogador"}</strong><small>Equipe: {team.name}</small></div>
    <label>Nome completo<input name="full_name" required defaultValue={player?.full_name||""} /></label>
    <label>Data de nascimento<input name="birth_date" type="date" required max={new Date().toISOString().split("T")[0]} defaultValue={player?.birth_date||""} /></label>
    <label>Número<input name="shirt_number" type="number" min="0" defaultValue={player?.shirt_number||""} /></label>
    <label>Categoria<input name="category" defaultValue={player?.category||""} placeholder="Ex.: Sub-15" /></label>
    <div className="form-buttons"><button type="button" onClick={onCancel}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy?"Salvando…":"Salvar jogador"}</button></div>
  </form>;
}

function RefereeAssignmentModal({ match, assignment, close, save }) {
  const [busy,setBusy]=useState(false);
  const submit=async event=>{event.preventDefault();setBusy(true);const values=Object.fromEntries(new FormData(event.currentTarget).entries());values.match_id=match.id;await save(values,assignment);setBusy(false)};
  return <div className="modal-wrap"><form className="modal small" onSubmit={submit}>
    <button type="button" className="modal-close" onClick={close}>×</button>
    <span className="eyebrow">{assignment?"EDITAR ESCALA":"ESCALAR ÁRBITRO"}</span><h2>{match.a} × {match.b}</h2><p>{match.date} · {match.time} · {match.court}</p>
    <label>Nome do árbitro<input name="referee_name" required autoFocus defaultValue={assignment?.referee_name||""} placeholder="Nome completo" /></label>
    <label>Escola de origem<input name="school_name" required defaultValue={assignment?.school_name||""} placeholder="Nome da escola" /></label>
    <label>Função na arbitragem<input name="assignment_role" required defaultValue={assignment?.assignment_role||"Árbitro"} placeholder="Ex.: Árbitro principal" /></label>
    <div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy?"Salvando…":"Salvar escala"}</button></div>
  </form></div>;
}

function Modal({ data, close, saveScore, saveRecord, saveUserRoles, saveTeamPlayer, saveRefereeAssignment, deletePlayerRecord, teams, groups, matches, players, notify, setRole }) {
  if (data.type === "score") return <div className="modal-wrap"><div className="modal"><button className="modal-close" onClick={close}>×</button><span className="eyebrow">ATUALIZAR PLACAR</span><h2>{data.match.a} × {data.match.b}</h2><p>{data.match.round} · {data.match.court}</p><ScoreForm match={data.match} save={saveScore} /></div></div>;
  if (data.type === "report") return <MatchReport match={data.match} number={data.number} players={players} close={close} />;
  if (data.type === "teamDetails") return <TeamDetailsModal team={data.team} players={players.filter(player=>player.team_id===data.team.id)} canEdit={data.canEdit} close={close} savePlayer={saveTeamPlayer} deletePlayer={deletePlayerRecord} />;
  if (data.type === "refereeAssignment") return <RefereeAssignmentModal match={data.match} assignment={data.assignment} close={close} save={saveRefereeAssignment} />;
  if (data.type === "userRoles") return <UserRolesModal membership={data.membership} close={close} save={saveUserRoles} />;
  if (data.type === "profile") return <div className="modal-wrap"><div className="modal small"><button className="modal-close" onClick={close}>×</button><span className="eyebrow">CONTA CONECTADA</span><h2>Perfil de acesso</h2><p>{data.email}</p><div className="role-options">{["Administrador","Professor","Treinador","Árbitro","Visualizador"].map(r=><button key={r} onClick={()=>{setRole(r);close();notify(`Visualização alterada para ${r}`)}}>{r}<span>→</span></button>)}</div><button className="signout-button" onClick={() => createClient().auth.signOut()}>Sair do sistema</button></div></div>;
  return <RecordModal type={data.type} data={data} teams={teams} groups={groups} close={close} saveRecord={saveRecord} />;
}

function MatchReport({ match, number, players, close }) {
  const rosterFor = teamId => {
    const teamPlayers = players.filter(player => player.team_id === teamId && player.active !== false);
    const numbered = teamPlayers
      .filter(player => Number.isInteger(Number(player.shirt_number)) && Number(player.shirt_number) > 0)
      .sort((a,b) => Number(a.shirt_number)-Number(b.shirt_number) || a.full_name.localeCompare(b.full_name, "pt-BR"));
    const unnumbered = teamPlayers
      .filter(player => !Number.isInteger(Number(player.shirt_number)) || Number(player.shirt_number) <= 0)
      .sort((a,b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
    const usedNumbers = new Set(numbered.map(player => Number(player.shirt_number)));
    let nextNumber = 1;
    const registered = [...numbered.map(player => ({...player, sheetNumber:Number(player.shirt_number)})), ...unnumbered.map(player => {
      while (usedNumbers.has(nextNumber)) nextNumber++;
      const sheetNumber = nextNumber++;
      usedNumbers.add(sheetNumber);
      return {...player, sheetNumber};
    })].slice(0,22);
    return Array.from({length:22}, (_,index) => registered[index] || null);
  };
  const TeamSheet = ({ name, color, burned, roster }) => <section className="sheet-team">
    <div className="sheet-team-title"><b>{name}</b><span>COR DO COLETE: <i style={{background:color}} /> __________________</span></div>
    <div className="sheet-school">ESCOLA / EQUIPE: <strong>{name}</strong></div>
    <div className="sheet-roster">
      <strong>ATLETAS INSCRITOS</strong>
      <div className="sheet-roster-list">{roster.map((player,index) => <div key={player?.id || `empty-${index}`}>
        <b>{String(player?.sheetNumber ?? index+1).padStart(2,"0")}.</b>
        <span>{player?.full_name || "________________________________"}</span>
      </div>)}</div>
    </div>
    <div className="burned-control">
      <strong>CONTROLE DE JOGADORES QUEIMADOS</strong>
      <p>Risque um quadrado para cada jogador queimado.</p>
      <div className="burned-grid">{Array.from({length:22},(_,index) => <span key={index} aria-label={`Marcação de jogador queimado ${index+1}`} />)}</div>
    </div>
    <div className="sheet-team-bottom"><span>POSSE INICIAL: ☐ SIM ☐ NÃO</span><span>JOGADORES QUEIMADOS: <b>{burned || "____"}</b></span></div>
  </section>;
  return <div className="modal-wrap report-modal-wrap"><article className="modal report-sheet">
    <button className="modal-close no-print" onClick={close}>×</button>
    <header className="official-sheet-header"><div className="sheet-logo">Coord<span>EDF</span></div><div><h1>SÚMULA QUEIMADA 2026</h1><p>{match.round.toUpperCase()}</p></div><div className="sheet-game">JOGO Nº <b>{String(number).padStart(3,"0")}</b></div></header>
    <div className="sheet-meta"><span>DATA: ____/____/2026</span><span>HORÁRIO: {match.time}</span><span>LOCAL: {match.court}</span><span>PLACAR: {match.sa ?? "___"} × {match.sb ?? "___"}</span></div>
    <div className="sheet-teams"><TeamSheet name={match.a} color={match.ca} burned={match.burnedA} roster={rosterFor(match.homeTeamId)}/><TeamSheet name={match.b} color={match.cb} burned={match.burnedB} roster={rosterFor(match.awayTeamId)}/></div>
    <section className="sheet-observations"><b>OBSERVAÇÕES / OCORRÊNCIAS:</b><span></span><span></span><span></span></section>
    <section className="sheet-signatures"><div>Árbitro responsável</div><div>Responsável — {match.a}</div><div>Responsável — {match.b}</div></section>
    <footer>17º Torneio de Queimada · CoordEDF · Documento oficial gerado pelo QueimaFácil</footer>
    <div className="modal-actions no-print"><button onClick={close}>Fechar</button><button className="primary-btn" onClick={() => window.print()}>Imprimir / Salvar PDF</button></div>
  </article></div>;
}

function Regulations() {
  return <article className="regulation-page">
    <header className="regulation-hero"><span className="eyebrow">DOCUMENTO OFICIAL</span><h2>17º Torneio de Queimada — 2026</h2><p>Regulamento oficial · CoordEDF</p><button className="primary-btn no-print" onClick={() => window.print()}>Imprimir regulamento</button></header>
    <RegulationSection number="1" title="Da participação"><ul>
      <li>Serão inscritos 22 crianças/estudantes e, no máximo, um auxiliar técnico (apoio), que poderão ser transportados sob responsabilidade da comissão organizadora do evento.</li>
      <li>Poderão participar alunos devidamente matriculados e cursando o 5º ano do Ensino Fundamental da Secretaria de Educação do Município de Hortolândia, nascidos no ano de 2015.</li>
      <li>Cada escola poderá inscrever 22 alunos, sendo 11 do sexo masculino e 11 do sexo feminino. Dez jogadores de cada sexo serão os iniciantes do jogo e os outros dois serão considerados reservas para eventuais substituições, quando houver necessidade.</li>
    </ul></RegulationSection>
    <RegulationSection number="2" title="Da responsabilidade dos professores"><ul>
      <li>Os professores/técnicos serão responsáveis pelas inscrições e documentações dos alunos, sob pena de exclusão da equipe das atividades do torneio caso a comissão técnica identifique divergências em relação ao regulamento, tanto antes quanto depois do jogo.</li>
      <li>Os jogadores inscritos na primeira fase não precisarão, necessariamente, participar das fases posteriores.</li>
    </ul></RegulationSection>
    <RegulationSection number="3" title="Dos uniformes"><ul>
      <li>Serão distribuídos coletes de cores diferentes antes do jogo, para uso sobre a camiseta branca do uniforme.</li>
      <li>Os participantes deverão usar as respectivas bermudas do uniforme, evitando bermuda jeans.</li>
      <li>O uso de tênis é obrigatório.</li>
    </ul></RegulationSection>
    <RegulationSection number="4" title="Do jogo">
      <RegulationTopic title="4.1. Início e dinâmica"><ul><li>O jogo começa com cada equipe em sua quadra e apenas um aluno de cada equipe no fundo da área de queima (cemitério).</li><li>O jogador que inicia no cemitério não pode queimar.</li><li>Esse jogador será trocado quando o primeiro jogador de sua equipe for queimado.</li></ul></RegulationTopic>
      <RegulationTopic title="4.2. Regras de queima"><ul><li>O jogador é considerado queimado quando a bola toca nele e, em seguida, toca o solo.</li><li>Se a bola tocar o solo antes de tocar o jogador, ele não estará queimado.</li><li>Se a bola tocar qualquer parte do corpo sem antes tocar o solo e, posteriormente, tocar o solo, o jogador será considerado queimado.</li><li>Mais de um jogador poderá ser queimado na mesma jogada se a bola tocar dois ou mais jogadores da equipe adversária e, em seguida, tocar o solo.</li><li>Quando um jogador for queimado, o jogo ficará parado até que ele reinicie a partida, jogando a bola do fundo da quadra.</li><li>O jogador queimado deverá evitar atravessar o campo adversário ao dirigir-se à área de queimados.</li><li>Todo jogador queimado deverá ir inicialmente ao fundo da área de queima (cemitério), reiniciar o jogo e poderá, já na primeira jogada, queimar um adversário.</li></ul></RegulationTopic>
      <RegulationTopic title="4.3. Salvar jogadores"><p>Um jogador será salvo quando um companheiro conseguir segurar a bola antes que ela toque o solo, mesmo que a bola tenha tocado outros jogadores da mesma equipe.</p></RegulationTopic>
      <RegulationTopic title="4.4. Áreas de queima (cemitério) e laterais"><p>As laterais também serão consideradas áreas de queima dentro de seus limites, permitindo jogadas e a queima de adversários após o primeiro lance realizado do fundo da área de queima.</p></RegulationTopic>
      <RegulationTopic title="4.5. Tempo de jogo"><ul><li>A partida terá duas etapas de 12 minutos corridos, com intervalo de três minutos, durante o qual os jogadores não poderão sair da quadra.</li><li>A paralisação do tempo será determinada pelo árbitro em caso de intercorrência, devendo ele avisar o mesário.</li></ul></RegulationTopic>
      <RegulationTopic title="4.6. Material e quadra"><ul><li>Será utilizada a quadra de voleibol, medindo 18 m × 9 m, com a linha média de prolongamento infinito para definições de posse de bola.</li><li>Será utilizada bola de voleibol, com aproximadamente 2 a 3 libras.</li></ul></RegulationTopic>
      <RegulationTopic title="4.7. Encerramento e pontuação"><ul><li>A partida terminará quando todos os jogadores de uma equipe forem queimados ou quando expirar o tempo regulamentar. Vencerá a equipe que tiver queimado mais adversários.</li><li>A equipe vencedora somará três pontos.</li><li>Em caso de empate, cada equipe somará um ponto.</li></ul></RegulationTopic>
      <RegulationTopic title="4.8. Jogo passivo"><ul><li>A equipe que permanecer por mais de 15 segundos circulando a bola pelas áreas de queima, sem intenção clara de queimar o adversário, cometerá jogo passivo. A contagem será realizada pelo árbitro.</li><li>Ultrapassado o tempo, a equipe perderá a posse. A outra equipe reiniciará o jogo no fundo da área de queima, conforme indicação do árbitro.</li></ul></RegulationTopic>
      <RegulationTopic title="4.9. Substituições"><p>Cada equipe terá direito a duas substituições durante o jogo. O atleta substituído não poderá retornar, salvo em situação especial de lesão.</p></RegulationTopic>
      <RegulationTopic title="4.10. Capitão e árbitro"><ul><li>Durante o jogo, somente o capitão poderá dirigir-se ao árbitro para solicitar explicações.</li><li>Ao árbitro caberá o poder de decisão, em primeira instância, sobre qualquer jogada duvidosa.</li></ul></RegulationTopic>
      <RegulationTopic title="4.11. Técnico e banco de reservas"><ul><li>Cada equipe poderá ter apenas um técnico responsável no banco de reservas. Na ausência ou impossibilidade do professor, poderá ser designado outro responsável ligado à escola.</li><li>Os professores deverão permanecer dentro da área delimitada pela organização para dirigir a equipe fora da quadra, sem ultrapassá-la até o encerramento da partida.</li></ul></RegulationTopic>
      <RegulationTopic title="4.12. Sequência de jogos"><p>Na medida do possível, os jogos serão intercalados conforme sua disposição.</p></RegulationTopic>
      <RegulationTopic title="4.13. Invasão de quadra"><ul><li>Será considerada invasão quando o jogador com a posse da bola pisar ou ultrapassar deliberadamente as linhas limítrofes da quadra. A penalidade será a perda da posse.</li><li>Tocar a bola no espaço aéreo do adversário para obter vantagem, sem que ela toque o solo, não será considerado invasão, desde que as linhas limítrofes não sejam tocadas durante a ação.</li></ul></RegulationTopic>
      <RegulationTopic title="4.14. Bola em objeto extraquadra"><ul><li>Se a bola tocar um objeto fora da quadra e retornar, a jogada terá validade e a posse permanecerá com a equipe que pegar a bola em seu campo.</li><li>Se a bola tocar o teto ou a rede de proteção e retornar, a posse permanecerá com a equipe que a pegar, mas não será possível queimar o adversário nessa jogada.</li></ul></RegulationTopic>
      <RegulationTopic title="4.15. Local e convocação"><p>Os jogos ocorrerão em local previamente marcado. Estarão convocados os jogadores, representantes das equipes e escolas e os convidados: diretor, assistente, coordenador e professores.</p></RegulationTopic>
    </RegulationSection>
    <RegulationSection number="5" title="Critérios de desempate"><p>Quando duas equipes estiverem empatadas em número de pontos, serão aplicados, nesta ordem:</p><ol><li>Confronto direto.</li><li>Maior número de jogadores queimados pela equipe durante a fase em disputa.</li><li>Menor número de jogadores da própria equipe queimados durante a fase em disputa.</li><li>Persistindo o empate, será realizado novo jogo com um tempo de 10 minutos. Se a igualdade continuar, o jogo prosseguirá até que um jogador seja queimado, sagrando-se vencedora a equipe responsável pela queima.</li></ol><p><strong>Observação:</strong> quando três ou mais equipes estiverem empatadas em pontos, o confronto direto será anulado e a aplicação começará pelo segundo critério.</p></RegulationSection>
    <RegulationSection number="6" title="Das punições"><p><strong>Cartão amarelo:</strong> o jogador poderá ser advertido em situações de desrespeito ou atitudes antidesportivas consideradas leves.</p><p><strong>Cartão vermelho:</strong> o jogador poderá ser expulso em caso de grosseria, violência, atitude antidesportiva grave ou quando já tiver recebido um cartão amarelo na mesma partida.</p><p><strong>Observação:</strong> a comissão organizadora avaliará se o jogador punido com cartão vermelho poderá participar da partida seguinte. Ele poderá ser substituído por outro jogador na próxima fase do torneio.</p></RegulationSection>
    <RegulationSection number="7" title="Disposições gerais"><p>Qualquer situação não prevista expressamente neste regulamento será julgada pela organização, inclusive quanto às punições cabíveis, não sendo admitido recurso.</p></RegulationSection>
    <footer className="regulation-footer">Secretaria de Educação · Centro de Formação dos Profissionais em Educação Paulo Freire<br/>Rua Euclides Pires de Assis, 205 — Remanso Campineiro — CEP 13184-330 · (19) 3897-8400 · cfpe@hortolandia.sp.gov.br · Hortolândia/SP</footer>
  </article>;
}

function RegulationSection({ number, title, children }) {
  return <section className="regulation-section"><span>{number}</span><div><h3>{title}</h3>{children}</div></section>;
}

function RegulationTopic({ title, children }) {
  return <div className="regulation-topic"><h4>{title}</h4>{children}</div>;
}

function RecordModal({ type, data, teams, groups, close, saveRecord }) {
  const titles = { newTournament: "Criar torneio", newTeam: "Cadastrar equipe", editTeam: "Editar equipe", newGroup: "Criar grupo", newPlayer: "Cadastrar jogador", newMatch: "Agendar partida", editMatch: "Editar partida", newUser: "Criar usuário e senha" };
  const submit = event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values = Object.fromEntries(formData.entries());
    if (type === "editMatch") values.id = data.match.id;
    if (type === "editTeam") values.id = data.team.id;
    if ((type === "newMatch" || type === "editMatch") && values.home_team_id === values.away_team_id) {
      const awayField = event.currentTarget.elements.away_team_id;
      awayField.setCustomValidity("Selecione uma equipe diferente da Equipe A.");
      awayField.reportValidity();
      return;
    }
    if (type === "newUser") values.roles = formData.getAll("roles");
    if (type === "newUser" && !values.roles.length) return;
    saveRecord(type, values);
  };
  return <div className="modal-wrap"><form className="modal" onSubmit={submit}>
    <button type="button" className="modal-close" onClick={close}>×</button>
    <span className="eyebrow">{type.startsWith("edit") ? "ALTERAR CADASTRO" : "NOVO REGISTRO"}</span><h2>{titles[type] || "Novo cadastro"}</h2><p>Os dados serão armazenados no Supabase.</p>
    {type === "newTournament" && <>
      <label>Nome do torneio<input name="name" required placeholder="Ex.: Interclasses 2026" autoFocus /></label>
      <div className="form-grid"><label>Categoria<input name="category" placeholder="Ex.: Ensino Médio" /></label><label>Local<input name="venue" placeholder="Ex.: Ginásio principal" /></label></div>
      <div className="form-grid"><label>Data inicial<input name="starts_on" type="date" /></label><label>Data final<input name="ends_on" type="date" /></label></div>
    </>}
    {(type === "newTeam" || type === "editTeam") && <>
      <label>Nome da equipe<input name="name" required placeholder="Ex.: Falcões" autoFocus defaultValue={data?.team?.name||""} /></label>
      <div className="form-grid"><label>Sigla<input name="short_name" maxLength="4" placeholder="FAL" defaultValue={data?.team?.short_name||""} /></label><label>Cor<input name="color" type="color" defaultValue={data?.team?.color||"#ff6945"} /></label></div>
      <label>Professor responsável<input name="coach_name" placeholder="Nome do professor" defaultValue={data?.team?.coach_name||""} /></label>
    </>}
    {type === "newGroup" && <>
      <label>Nome do grupo<input name="name" required placeholder="Ex.: Grupo A" autoFocus /></label>
      <input name="phase_number" type="hidden" value="1" readOnly />
      <label>Ordem de exibição<input name="sort_order" type="number" min="0" defaultValue="0" /></label>
    </>}
    {type === "newPlayer" && <>
      <label>Nome completo<input name="full_name" required placeholder="Nome do atleta" autoFocus /></label>
      <label>Equipe<select name="team_id" required defaultValue=""><option value="" disabled>Selecione a equipe</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <label>Data de nascimento<input name="birth_date" type="date" required max={new Date().toISOString().split("T")[0]} /></label>
      <div className="form-grid"><label>Número<input name="shirt_number" type="number" min="0" /></label><label>Categoria<input name="category" placeholder="Ex.: Sub-15" /></label></div>
    </>}
    {(type === "newMatch" || type === "editMatch") && <>
      <div className="form-grid"><label>Equipe A<select name="home_team_id" required defaultValue={data?.match?.homeTeamId||""}><option value="" disabled>Selecione</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Equipe B<select name="away_team_id" required defaultValue={data?.match?.awayTeamId||""} onChange={event=>event.currentTarget.setCustomValidity("")}><option value="" disabled>Selecione</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
      <label>Fase<input name="phase" defaultValue={data?.match?.phase||"Fase de grupos"} /></label>
      <label>Grupo<select name="group_id" defaultValue={data?.match?.groupId||""}><option value="">Sem grupo definido</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      <div className="form-grid"><label>Data e horário<input name="scheduled_at" type="datetime-local" defaultValue={data?.match?.scheduledAt||""} /></label><label>Quadra<input name="court" placeholder="Quadra A" defaultValue={data?.match?.court?.includes("a definir")?"":data?.match?.court||""} /></label></div>
    </>}
    {type === "newUser" && <><label>Nome completo<input name="full_name" required placeholder="Nome do usuário" autoFocus /></label><label>E-mail do usuário<input name="email" type="email" required placeholder="pessoa@escola.com.br" /></label><label>Senha temporária<input name="password" type="text" minLength="8" required placeholder="Mínimo de 8 caracteres" autoComplete="off" /></label><div className="field-title">Funções no evento</div><div className="role-checkboxes compact">{selectableRoles.map(([value,label,description])=><label key={value}><input name="roles" value={value} type="checkbox" defaultChecked={value==="visualizador"} /><span><strong>{label}</strong><small>{description}</small></span></label>)}</div><div className="security-note"><span>🔑</span><div><strong>Primeiro acesso simplificado</strong><p>Informe o e-mail e a senha temporária à pessoa. Nenhuma confirmação por e-mail será necessária, e o sistema exigirá uma nova senha no primeiro login.</p></div></div></>}
    <div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="primary-btn">Salvar no Supabase</button></div>
  </form></div>;
}

function ScoreForm({ match, save }) {
  const [burnedA,setBurnedA]=useState(match.burnedA || match.sa || 0),[burnedB,setBurnedB]=useState(match.burnedB || match.sb || 0);
  return <form onSubmit={e=>{e.preventDefault();save(match.id,burnedA,burnedB,burnedA,burnedB)}}><div className="score-editor"><div><TeamMark name={match.a} color={match.ca}/><label>Adversários queimados<input type="number" min="0" max="99" value={burnedA} onChange={e=>setBurnedA(e.target.value)}/></label></div><b>×</b><div><TeamMark name={match.b} color={match.cb}/><label>Adversários queimados<input type="number" min="0" max="99" value={burnedB} onChange={e=>setBurnedB(e.target.value)}/></label></div></div><label>Observação da arbitragem<textarea placeholder="Opcional" /></label><div className="modal-actions"><button type="button">Salvar rascunho</button><button className="primary-btn">Publicar resultado</button></div></form>;
}
