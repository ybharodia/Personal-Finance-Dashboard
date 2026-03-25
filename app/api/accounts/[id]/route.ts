import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { custom_name, owner, account_group } = body;

    const fields: { custom_name?: string | null; owner?: string | null; account_group?: string | null } = {};

    if ("custom_name" in body) {
      if (typeof custom_name !== "string" && custom_name !== null)
        return NextResponse.json({ error: "custom_name must be string or null" }, { status: 400 });
      fields.custom_name = custom_name?.trim() || null;
    }
    if ("owner" in body) {
      if (typeof owner !== "string" && owner !== null)
        return NextResponse.json({ error: "owner must be string or null" }, { status: 400 });
      fields.owner = owner;
    }
    if ("account_group" in body) {
      if (typeof account_group !== "string" && account_group !== null)
        return NextResponse.json({ error: "account_group must be string or null" }, { status: 400 });
      fields.account_group = account_group;
    }

    if (Object.keys(fields).length === 0)
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

    const db = createAdminClient();
    const { error } = await db.from("accounts").update(fields).eq("id", id);

    if (error) {
      console.error("[accounts] update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
