import { NextResponse } from "next/server";
import { createAdminClient, getAuthenticatedUser } from "../../../../lib/supabase/admin";

export async function POST(request) {
  try {
    const admin = createAdminClient();
    const user = await getAuthenticatedUser(admin, request);
    if (!user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: { ...user.app_metadata, must_change_password: false }
    });
    if (error) return NextResponse.json({ error: "Não foi possível liberar o acesso." }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Erro interno ao atualizar senha." }, { status: 500 });
  }
}
