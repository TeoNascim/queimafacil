import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "../../../../lib/supabase/admin";

const allowedRoles = ["admin", "professor", "treinador", "arbitro", "visualizador"];

export async function GET(request) {
  try {
    const admin = createAdminClient();
    const caller = await getAuthenticatedUser(admin, request);
    if (!caller) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const organizationId = new URL(request.url).searchParams.get("organization_id") || "";
    const { data: callerMembership, error: callerError } = await admin
      .from("memberships")
      .select("role, roles")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("active", true)
      .maybeSingle();
    const callerRoles = callerMembership?.roles?.length ? callerMembership.roles : [callerMembership?.role].filter(Boolean);
    if (callerError || !callerRoles.includes("admin")) {
      return NextResponse.json({ error: "Somente administradores podem consultar usuários." }, { status: 403 });
    }

    const { data: memberships, error } = await admin
      .from("memberships")
      .select("id, user_id, role, roles, active, profile:profiles(id, full_name, email)")
      .eq("organization_id", organizationId)
      .order("created_at");
    if (error) throw error;

    const users = await Promise.all((memberships || []).map(async membership => {
      const { data } = await admin.auth.admin.getUserById(membership.user_id);
      const authUser = data?.user;
      return {
        ...membership,
        profile: {
          id: membership.profile?.id || membership.user_id,
          full_name: membership.profile?.full_name || authUser?.user_metadata?.full_name || "",
          email: membership.profile?.email || authUser?.email || ""
        }
      };
    }));
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Erro interno ao consultar usuários." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const admin = createAdminClient();
    const caller = await getAuthenticatedUser(admin, request);
    if (!caller) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.full_name || "").trim();
    const password = String(body.password || "");
    const organizationId = String(body.organization_id || "");
    const roles = [...new Set(Array.isArray(body.roles) ? body.roles : [])].filter(role => allowedRoles.includes(role));

    if (!email || !email.includes("@")) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    if (!fullName) return NextResponse.json({ error: "Informe o nome completo." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "A senha temporária deve ter pelo menos 8 caracteres." }, { status: 400 });
    if (!organizationId || !roles.length) return NextResponse.json({ error: "Selecione ao menos uma função." }, { status: 400 });

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("role, roles, active")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("active", true)
      .maybeSingle();
    const callerRoles = membership?.roles?.length ? membership.roles : [membership?.role].filter(Boolean);
    if (membershipError || !callerRoles.includes("admin")) {
      return NextResponse.json({ error: "Somente administradores podem criar usuários." }, { status: 403 });
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { must_change_password: true }
    });
    if (createError) {
      const message = createError.message?.toLowerCase().includes("already")
        ? "Este e-mail já possui uma conta."
        : createError.message || "Não foi possível criar a conta.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { error: accessError } = await admin.from("memberships").insert({
      organization_id: organizationId,
      user_id: created.user.id,
      role: roles[0],
      roles,
      active: true
    });
    if (accessError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: "A conta não pôde receber as permissões selecionadas." }, { status: 400 });
    }

    return NextResponse.json({
      user: { id: created.user.id, email: created.user.email, full_name: fullName },
      message: "Usuário criado com senha temporária."
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Erro interno ao criar usuário." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const admin = createAdminClient();
    const caller = await getAuthenticatedUser(admin, request);
    if (!caller) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const body = await request.json();
    const organizationId = String(body.organization_id || "");
    const membershipId = String(body.membership_id || "");
    const userId = String(body.user_id || "");
    const fullName = String(body.full_name || "").trim();
    const roles = [...new Set(Array.isArray(body.roles) ? body.roles : [])].filter(role => allowedRoles.includes(role));

    if (!organizationId || !membershipId || !userId) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
    if (!fullName) return NextResponse.json({ error: "Informe o nome completo." }, { status: 400 });
    if (!roles.length) return NextResponse.json({ error: "Selecione ao menos uma função." }, { status: 400 });

    const { data: callerMembership, error: callerError } = await admin
      .from("memberships")
      .select("role, roles")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("active", true)
      .maybeSingle();
    const callerRoles = callerMembership?.roles?.length ? callerMembership.roles : [callerMembership?.role].filter(Boolean);
    if (callerError || !callerRoles.includes("admin")) {
      return NextResponse.json({ error: "Somente administradores podem editar usuários." }, { status: 403 });
    }

    const { data: target } = await admin
      .from("memberships")
      .select("id")
      .eq("id", membershipId)
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) return NextResponse.json({ error: "Usuário não encontrado nesta organização." }, { status: 404 });

    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (profileError) throw profileError;
    const { error: accessError } = await admin
      .from("memberships")
      .update({ role: roles[0], roles })
      .eq("id", membershipId)
      .eq("organization_id", organizationId);
    if (accessError) throw accessError;

    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: { ...authUser?.user?.user_metadata, full_name: fullName }
    });
    return NextResponse.json({ message: "Usuário atualizado com sucesso." });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Erro interno ao editar usuário." }, { status: 500 });
  }
}
