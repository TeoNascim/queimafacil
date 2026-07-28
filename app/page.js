"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../lib/supabase/client";
import {
  assignTeamToGroup, createGroup, createMatch, createPlayer, createTeam, createTournament,
  claimInvitation, createInvitation, deleteOrganizationUser, getCurrentContext, getGroups, getInvitations,
  getAuditLog, getOrganizationUsers, getPlayers, getPublicTournament, getTeams,
  getTournamentMatches, getTournaments, publishTournament, roleLabel, updateMatchScore
} from "../lib/supabase/data";

const icons = {
  dashboard: "▦", tournaments: "🏆", matches: "◎", teams: "♟", groups: "◫", players: "♙",
  standings: "≡", reports: "▤", regulations: "§", users: "♧", settings: "⚙"
};

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
  ["reports", "Súmulas"], ["regulations", "Regulamento"], ["users", "Usuários"]
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
        setRole(roleLabel(context.role));
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
      setMatches([]); setTeamRows([]); setPlayerRows([]); setGroupRows([]);
      return;
    }
    const [dbMatches, dbTeams, dbPlayers, dbGroups, dbUsers, dbInvitations, dbAudit] = await Promise.all([
      getTournamentMatches(selected.id), getTeams(selected.id), getPlayers(selected.id), getGroups(selected.id),
      getOrganizationUsers(organizationId), getInvitations(organizationId), getAuditLog(organizationId)
    ]);
    setMatches(dbMatches.map(mapMatch));
    setTeamRows(dbTeams);
    setPlayerRows(dbPlayers);
    setGroupRows(dbGroups);
    setUserRows(dbUsers);
    setInvitationRows(dbInvitations);
    setAuditRows(dbAudit);
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
        if (!activeTournament) throw new Error("Crie um torneio primeiro.");
        if (type === "newTeam") await createTeam(activeTournament.id, values);
        if (type === "newGroup") await createGroup(activeTournament.id, values);
        if (type === "newPlayer") await createPlayer(values);
        if (type === "newMatch") await createMatch(activeTournament.id, values);
        if (type === "newUser") {
          const invitation = await createInvitation(context.organization.id, session.user.id, values);
          const link = `${window.location.origin}/?invite=${invitation.token}`;
          await navigator.clipboard.writeText(link);
          notify("Convite criado e link copiado");
        }
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
  const notify = text => { setToast(text); setTimeout(() => setToast(""), 2600); };
  const title = menu.find(x => x[0] === page)?.[1] || "Visão geral";
  const roleKey = context?.role;
  const canManage = ["admin", "professor"].includes(roleKey);
  const canManagePlayers = [...["admin", "professor"], "treinador"].includes(roleKey);
  const canScore = ["admin", "professor", "arbitro"].includes(roleKey);
  const visibleMenu = menu.filter(([key]) => key !== "users" || roleKey === "admin");

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
          {page === "matches" && <Matches matches={matches} setModal={setModal} canManage={canManage} canScore={canScore} />}
          {page === "standings" && <Standings full rows={classification} />}
          {page === "teams" && <Teams rows={teamRows} setModal={setModal} canManage={canManage} />}
          {page === "groups" && <Groups rows={groupRows} teams={teamRows} setModal={setModal} onAssign={assignGroup} canManage={canManage} />}
          {page === "tournaments" && <Tournaments rows={tournaments} active={activeTournament} onPublish={publish} setPage={setPage} setModal={setModal} canManage={canManage} />}
          {page === "players" && <Players rows={playerRows} setModal={setModal} canManage={canManagePlayers} />}
          {page === "reports" && <Reports matches={matches} audit={auditRows} setModal={setModal} notify={notify} />}
          {page === "regulations" && <Regulations />}
          {page === "users" && roleKey === "admin" && <Users rows={userRows} invitations={invitationRows} setModal={setModal} onDelete={deleteUser} currentUserId={session.user.id} />}
        </div>
      </main>
      {modal && <Modal data={modal} close={() => setModal(null)} saveScore={saveScore} saveRecord={saveRecord} teams={teamRows} players={playerRows} notify={notify} setRole={setRole} />}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}
    </div>
  );
}

function mapMatch(match) {
  const when = match.scheduled_at ? new Date(match.scheduled_at) : null;
  return {
    id: match.id,
    time: when ? when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "A definir",
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
    awayTeamId: match.away_team_id
  };
}

function buildStandings(teamRows, matchRows) {
  const table = new Map(teamRows.map(team => [team.id, {
    p: 0, team: team.name, tag: team.short_name || team.name.slice(0,3).toUpperCase(),
    id: team.id, pts: 0, j: 0, v: 0, d: 0, burnedFor: 0, burnedAgainst: 0,
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

function MatchCard({ match, onScore, canScore = false }) {
  return <article className="match-card">
    <div className="match-top"><span className={`status ${match.status.toLowerCase()}`}>{match.status === "Encerrada" ? "✓ " : ""}{match.status}</span><span>{match.time} · {match.court}</span><button>•••</button></div>
    <div className="round">{match.round}</div>
    <div className="versus">
      <TeamMark name={match.a} color={match.ca} /><div className="score">{match.sa ?? "–"} <small>×</small> {match.sb ?? "–"}</div><TeamMark name={match.b} color={match.cb} />
    </div>
    <div className="match-actions">
      {match.status === "Encerrada" ? <>{canScore && <button onClick={onScore}>Editar placar</button>}</> : canScore && <button className={match.status === "Próxima" ? "primary" : ""} onClick={onScore}>{match.status === "Próxima" ? "Inserir placar" : "Ver detalhes"}</button>}
    </div>
  </article>;
}

function TeamMark({ name, color }) {
  return <div className="team-mark"><span style={{ background: color }}>{name.slice(0, 2).toUpperCase()}</span><strong>{name}</strong></div>;
}

function Standings({ full = false, rows = [] }) {
  return <div className={full ? "panel full-panel" : ""}>
    {full && <div className="page-tools"><div><h2>Classificação geral</h2><p>Desempate: confronto direto (2 equipes), queimados a favor e queimados contra</p></div><select><option>Todos os grupos</option><option>Grupo A</option><option>Grupo B</option></select></div>}
    <div className="table-wrap"><table><thead><tr><th>#</th><th>Equipe</th><th>PTS</th><th>J</th><th>V</th><th>D</th><th>QF</th><th>QC</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.team}><td><span className={r.p <= 2 ? "rank top" : "rank"}>{r.p}</span></td><td><div className="table-team"><span style={{ background: r.color }}>{r.tag}</span><strong>{r.team}</strong></div></td><td><b>{r.pts}</b></td><td>{r.j}</td><td>{r.v}</td><td>{r.d}</td><td>{r.burnedFor}</td><td>{r.burnedAgainst}</td></tr>)}</tbody>
    </table></div>
    {!rows.length && <div className="inline-empty">Cadastre equipes para iniciar a classificação.</div>}
  </div>;
}

function Activity({ icon, tone, title, text, time }) {
  return <div className="activity"><span className={tone}>{icon}</span><div><strong>{title}</strong><p>{text}</p><small>{time}</small></div></div>;
}

function Matches({ matches, setModal, canManage, canScore }) {
  return <section className="panel full-panel">
    <div className="page-tools"><div><h2>Tabela de partidas</h2><p>Organize horários, quadras e resultados</p></div><div className="tool-actions"><select><option>Todas as rodadas</option><option>Rodada 3</option></select>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newMatch" })}>＋ Nova partida</button>}</div></div>
    <div className="match-list">{matches.map(m => <MatchCard key={m.id} match={m} onScore={() => setModal({ type: "score", match: m })} canScore={canScore} />)}</div>
  </section>;
}

function Teams({ rows, setModal, canManage }) {
  return <><div className="page-tools"><div><h2>Equipes inscritas</h2><p>{rows.length} equipes cadastradas no torneio</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newTeam" })}>＋ Nova equipe</button>}</div>
    {rows.length ? <div className="team-grid">{rows.map(t => <article className="team-card" key={t.id}><div className="big-team-mark" style={{ background: t.color || "#ff6945" }}>{(t.short_name || t.name.slice(0, 2)).toUpperCase()}</div><div><span className="group-tag">{t.group?.name || "SEM GRUPO"}</span><h3>{t.name}</h3><p>{t.coach_name || "Professor não informado"}</p></div><div className="team-meta"><span>Dados sincronizados</span><button>Ver equipe →</button></div></article>)}</div> : <div className="inline-empty">Nenhuma equipe cadastrada.</div>}</>;
}

function Groups({ rows, teams, setModal, onAssign, canManage }) {
  return <>
    <div className="page-tools"><div><h2>Grupos do torneio</h2><p>Distribua as equipes antes de gerar as rodadas</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newGroup" })}>＋ Novo grupo</button>}</div>
    {rows.length ? <div className="group-grid">{rows.map(group => {
      const members = teams.filter(team => team.group_id === group.id);
      return <section className="panel group-panel" key={group.id}><div className="panel-title"><div><span className="group-tag">GRUPO</span><h2>{group.name}</h2></div><strong>{members.length} equipes</strong></div>{members.map(team => <div className="group-team" key={team.id}><span style={{background:team.color || "#ff6945"}}>{(team.short_name || team.name.slice(0,2)).toUpperCase()}</span><strong>{team.name}</strong>{canManage && <button onClick={() => onAssign(team.id, "")}>Remover</button>}</div>)}{!members.length && <p className="group-empty">Nenhuma equipe neste grupo.</p>}</section>;
    })}</div> : <div className="inline-empty">Crie o Grupo A, Grupo B ou a estrutura desejada.</div>}
    {!!teams.length && canManage && <section className="panel distribution-panel"><div className="panel-title"><div><h2>Distribuição das equipes</h2><p>Escolha o grupo de cada equipe</p></div></div>{teams.map(team => <div className="distribution-row" key={team.id}><strong>{team.name}</strong><select value={team.group_id || ""} onChange={event => onAssign(team.id, event.target.value)}><option value="">Sem grupo</option>{rows.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></div>)}</section>}
  </>;
}

function Tournaments({ rows, active, onPublish, setPage, setModal, canManage }) {
  return <><div className="page-tools"><div><h2>Seus torneios</h2><p>Crie, acompanhe e encerre competições</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newTournament" })}>＋ Novo torneio</button>}</div>
    {rows.length ? <div className="tournament-grid">{rows.map(item => <article className={item.id === active?.id ? "tournament-card featured" : "tournament-card"} key={item.id}><div className="trophy">🏆</div><span className={`status ${item.status === "em_andamento" ? "proxima" : "agendada"}`}>{item.status.replaceAll("_"," ").toUpperCase()}</span><h2>{item.name}</h2><p>{item.category || "Categoria não informada"} · {item.venue || "Local a definir"}</p><div className="tournament-numbers"><span><b>{item.starts_on ? new Date(`${item.starts_on}T12:00`).toLocaleDateString("pt-BR") : "—"}</b> início</span><span><b>{item.ends_on ? new Date(`${item.ends_on}T12:00`).toLocaleDateString("pt-BR") : "—"}</b> término</span></div><div className="tournament-actions"><button onClick={() => setPage("dashboard")}>Abrir torneio</button>{canManage && <button onClick={() => onPublish(item.id)}>{item.status === "em_andamento" ? "Copiar link público" : "Publicar resultados"}</button>}</div></article>)}</div> : <div className="inline-empty">Nenhum torneio criado.</div>}</>;
}

function Players({ rows, setModal, canManage }) {
  return <section className="panel full-panel"><div className="page-tools"><div><h2>Jogadores</h2><p>{rows.length} atletas cadastrados</p></div>{canManage && <button className="primary-btn" onClick={() => setModal({ type: "newPlayer" })}>＋ Novo jogador</button>}</div>
    <div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Equipe</th><th>Número</th><th>Categoria</th><th>Status</th></tr></thead><tbody>{rows.map(player=><tr key={player.id}><td><div className="person"><span>{player.full_name.split(" ").map(x=>x[0]).join("").slice(0,2)}</span><strong>{player.full_name}</strong></div></td><td>{player.team?.name}</td><td>{player.shirt_number ? `#${String(player.shirt_number).padStart(2,"0")}` : "—"}</td><td>{player.category || "—"}</td><td><span className={player.active ? "status encerrada" : "status agendada"}>{player.active ? "✓ Apto" : "Inativo"}</span></td></tr>)}</tbody></table></div></section>;
}

function Reports({ matches, audit, setModal }) {
  return <><div className="page-tools"><div><h2>Súmulas das partidas</h2><p>Documentos oficiais prontos para impressão ou PDF</p></div></div>
    {matches.length ? <div className="report-grid">{matches.map((m,i)=><article className="report-card" key={m.id}><div className="doc-icon">▤</div><div><span>SÚMULA #{String(i+1).padStart(4,"0")}</span><h3>{m.a} × {m.b}</h3><p>{m.round} · {m.time} · {m.court}</p></div><span className={`status ${m.status.toLowerCase()}`}>{m.status.toUpperCase()}</span><button onClick={() => setModal({type:"report",match:m,number:i+1})}>Visualizar</button></article>)}</div> : <div className="inline-empty">Agende uma partida para gerar a primeira súmula.</div>}
    <section className="panel audit-panel"><div className="panel-title"><div><h2>Histórico de alterações</h2><p>Últimas ações registradas no Supabase</p></div></div>{audit.length ? audit.map(item=><div className="audit-row" key={item.id}><span>✓</span><div><strong>{item.action.replaceAll("_"," ")}</strong><small>{item.entity_type} · {new Date(item.created_at).toLocaleString("pt-BR")}</small></div></div>) : <p className="group-empty">O histórico aparecerá após a próxima alteração de placar.</p>}</section>
  </>;
}

function Users({ rows, invitations, setModal, onDelete, currentUserId }) {
  const descriptions={admin:"Acesso total",professor:"Equipes e atletas",treinador:"Cadastra jogadores e visualiza o sistema",arbitro:"Partidas atribuídas",visualizador:"Somente resultados"};
  return <section className="panel full-panel"><div className="page-tools"><div><h2>Usuários e permissões</h2><p>{rows.length} usuários ativos na CoordEDF</p></div><button className="primary-btn" onClick={() => setModal({ type: "newUser" })}>＋ Convidar usuário</button></div>
    <div className="user-list">{rows.map((item,i)=>{const name=item.profile?.full_name || item.profile?.email || "Usuário"; const initials=name.split(" ").map(x=>x[0]).join("").slice(0,2).toUpperCase(); const isCurrentUser=item.user_id===currentUserId; return <div className="user-row" key={item.id}><span className={`person-avatar c${i%3}`}>{initials}</span><div><strong>{name}{isCurrentUser && <em className="current-user">Você</em>}</strong><small>{item.profile?.email} · {descriptions[item.role]}</small></div><span className={`role role${i%3}`}>{roleLabel(item.role)}</span><span className="online">● {item.active ? "Ativo" : "Inativo"}</span>{isCurrentUser ? <span className="protected-user" title="Seu próprio acesso está protegido">Protegido</span> : <button className="delete-user" onClick={()=>onDelete(item)} aria-label={`Excluir usuário ${name}`}>Excluir</button>}</div>})}</div>
    {!!invitations.filter(invite=>!invite.accepted_at).length && <div className="pending-invites"><h3>Convites pendentes</h3>{invitations.filter(invite=>!invite.accepted_at).map(invite=><div key={invite.id}><span>✉</span><div><strong>{invite.email}</strong><small>{roleLabel(invite.role)} · válido até {new Date(invite.expires_at).toLocaleDateString("pt-BR")}</small></div><button onClick={()=>navigator.clipboard.writeText(`${window.location.origin}/?invite=${invite.token}`)}>Copiar link</button></div>)}</div>}
    <div className="security-note"><span>🔒</span><div><strong>Acesso protegido pelo Supabase</strong><p>Cada pessoa cria a própria senha e recebe somente as permissões do perfil escolhido.</p></div></div>
  </section>;
}

function Modal({ data, close, saveScore, saveRecord, teams, players, notify, setRole }) {
  if (data.type === "score") return <div className="modal-wrap"><div className="modal"><button className="modal-close" onClick={close}>×</button><span className="eyebrow">ATUALIZAR PLACAR</span><h2>{data.match.a} × {data.match.b}</h2><p>{data.match.round} · {data.match.court}</p><ScoreForm match={data.match} save={saveScore} /></div></div>;
  if (data.type === "report") return <MatchReport match={data.match} number={data.number} players={players} close={close} />;
  if (data.type === "profile") return <div className="modal-wrap"><div className="modal small"><button className="modal-close" onClick={close}>×</button><span className="eyebrow">CONTA CONECTADA</span><h2>Perfil de acesso</h2><p>{data.email}</p><div className="role-options">{["Administrador","Professor","Treinador","Árbitro","Visualizador"].map(r=><button key={r} onClick={()=>{setRole(r);close();notify(`Visualização alterada para ${r}`)}}>{r}<span>→</span></button>)}</div><button className="signout-button" onClick={() => createClient().auth.signOut()}>Sair do sistema</button></div></div>;
  return <RecordModal type={data.type} teams={teams} close={close} saveRecord={saveRecord} />;
}

function MatchReport({ match, number, close }) {
  const TeamSheet = ({ name, color, burned }) => <section className="sheet-team">
    <div className="sheet-team-title"><b>{name}</b><span>COR DO COLETE: <i style={{background:color}} /> __________________</span></div>
    <div className="sheet-school">ESCOLA / EQUIPE: <strong>{name}</strong></div>
    <div className="burned-control">
      <strong>CONTROLE DE JOGADORES QUEIMADOS</strong>
      <p>Risque um quadrado para cada jogador queimado.</p>
      <div className="burned-grid">{Array.from({length:22},(_,index) => <span key={index} aria-label={`Jogador queimado ${index+1}`}>{index+1}</span>)}</div>
    </div>
    <div className="sheet-team-bottom"><span>POSSE INICIAL: ☐ SIM ☐ NÃO</span><span>JOGADORES QUEIMADOS: <b>{burned || "____"}</b></span></div>
  </section>;
  return <div className="modal-wrap report-modal-wrap"><article className="modal report-sheet">
    <button className="modal-close no-print" onClick={close}>×</button>
    <header className="official-sheet-header"><div className="sheet-logo">Coord<span>EDF</span></div><div><h1>SÚMULA QUEIMADA 2026</h1><p>{match.round.toUpperCase()}</p></div><div className="sheet-game">JOGO Nº <b>{String(number).padStart(3,"0")}</b></div></header>
    <div className="sheet-meta"><span>DATA: ____/____/2026</span><span>HORÁRIO: {match.time}</span><span>LOCAL: {match.court}</span><span>PLACAR: {match.sa ?? "___"} × {match.sb ?? "___"}</span></div>
    <div className="sheet-teams"><TeamSheet name={match.a} color={match.ca} burned={match.burnedA}/><TeamSheet name={match.b} color={match.cb} burned={match.burnedB}/></div>
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
      <li>Poderão participar alunos devidamente matriculados e cursando o 5º ano do Ensino Fundamental da Secretaria de Educação do Município de Hortolândia, nascidos no ano de 2014.</li>
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
      <RegulationTopic title="4.7. Encerramento e pontuação"><ul><li>A partida terminará quando todos os jogadores de uma equipe forem queimados ou quando expirar o tempo regulamentar. Vencerá a equipe que tiver queimado mais adversários.</li><li>A equipe vencedora somará três pontos.</li></ul></RegulationTopic>
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

function RecordModal({ type, teams, close, saveRecord }) {
  const titles = { newTournament: "Criar torneio", newTeam: "Cadastrar equipe", newGroup: "Criar grupo", newPlayer: "Cadastrar jogador", newMatch: "Agendar partida", newUser: "Convidar usuário" };
  const submit = event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    saveRecord(type, values);
  };
  return <div className="modal-wrap"><form className="modal" onSubmit={submit}>
    <button type="button" className="modal-close" onClick={close}>×</button>
    <span className="eyebrow">NOVO REGISTRO</span><h2>{titles[type] || "Novo cadastro"}</h2><p>Os dados serão armazenados no Supabase.</p>
    {type === "newTournament" && <>
      <label>Nome do torneio<input name="name" required placeholder="Ex.: Interclasses 2026" autoFocus /></label>
      <div className="form-grid"><label>Categoria<input name="category" placeholder="Ex.: Ensino Médio" /></label><label>Local<input name="venue" placeholder="Ex.: Ginásio principal" /></label></div>
      <div className="form-grid"><label>Data inicial<input name="starts_on" type="date" /></label><label>Data final<input name="ends_on" type="date" /></label></div>
    </>}
    {type === "newTeam" && <>
      <label>Nome da equipe<input name="name" required placeholder="Ex.: Falcões" autoFocus /></label>
      <div className="form-grid"><label>Sigla<input name="short_name" maxLength="4" placeholder="FAL" /></label><label>Cor<input name="color" type="color" defaultValue="#ff6945" /></label></div>
      <label>Professor responsável<input name="coach_name" placeholder="Nome do professor" /></label>
    </>}
    {type === "newGroup" && <>
      <label>Nome do grupo<input name="name" required placeholder="Ex.: Grupo A" autoFocus /></label>
      <label>Ordem de exibição<input name="sort_order" type="number" min="0" defaultValue="0" /></label>
    </>}
    {type === "newPlayer" && <>
      <label>Nome completo<input name="full_name" required placeholder="Nome do atleta" autoFocus /></label>
      <label>Equipe<select name="team_id" required defaultValue=""><option value="" disabled>Selecione a equipe</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
      <div className="form-grid"><label>Número<input name="shirt_number" type="number" min="0" /></label><label>Categoria<input name="category" placeholder="Ex.: Sub-15" /></label></div>
    </>}
    {type === "newMatch" && <>
      <div className="form-grid"><label>Equipe A<select name="home_team_id" required defaultValue=""><option value="" disabled>Selecione</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label>Equipe B<select name="away_team_id" required defaultValue=""><option value="" disabled>Selecione</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label></div>
      <label>Fase<input name="phase" defaultValue="Fase de grupos" /></label>
      <div className="form-grid"><label>Data e horário<input name="scheduled_at" type="datetime-local" /></label><label>Quadra<input name="court" placeholder="Quadra A" /></label></div>
    </>}
    {type === "newUser" && <><label>E-mail do convidado<input name="email" type="email" required placeholder="pessoa@escola.com.br" autoFocus /></label><label>Função<select name="role" required defaultValue="visualizador"><option value="professor">Professor</option><option value="treinador">Treinador</option><option value="arbitro">Árbitro</option><option value="visualizador">Visualizador</option><option value="admin">Administrador</option></select></label><div className="security-note"><span>🔗</span><div><strong>Link individual</strong><p>Ao salvar, o link será copiado para você enviar ao convidado.</p></div></div></>}
    <div className="modal-actions"><button type="button" onClick={close}>Cancelar</button><button className="primary-btn">Salvar no Supabase</button></div>
  </form></div>;
}

function ScoreForm({ match, save }) {
  const [burnedA,setBurnedA]=useState(match.burnedA || match.sa || 0),[burnedB,setBurnedB]=useState(match.burnedB || match.sb || 0);
  return <form onSubmit={e=>{e.preventDefault();save(match.id,burnedA,burnedB,burnedA,burnedB)}}><div className="score-editor"><div><TeamMark name={match.a} color={match.ca}/><label>Adversários queimados<input type="number" min="0" max="99" value={burnedA} onChange={e=>setBurnedA(e.target.value)}/></label></div><b>×</b><div><TeamMark name={match.b} color={match.cb}/><label>Adversários queimados<input type="number" min="0" max="99" value={burnedB} onChange={e=>setBurnedB(e.target.value)}/></label></div></div><label>Observação da arbitragem<textarea placeholder="Opcional" /></label><div className="modal-actions"><button type="button">Salvar rascunho</button><button className="primary-btn">Publicar resultado</button></div></form>;
}
