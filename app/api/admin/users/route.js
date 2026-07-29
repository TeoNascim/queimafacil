import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "../../../../lib/supabase/admin";

const allowedRoles = ["admin", "professor", "treinador", "arbitro", "visualizador"];

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
