import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { custom_name } = await req.json();

    if (typeof custom_name !== "string" && custom_name !== null) {
      return NextResponse.json({ error: "custom_name must be a string or null" }, { status: 400 });
    }

    const db = createAdminClient();
    const { error } = await db
      .from("accounts")
      .update({ custom_name: custom_name?.trim() || null })
      .eq("id", id);

    if (error) {
      console.error("[accounts] rename error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
