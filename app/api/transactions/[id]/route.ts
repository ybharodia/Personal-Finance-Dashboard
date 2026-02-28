import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { category } = await req.json();

    if (typeof category !== "string" || !category.trim()) {
      return NextResponse.json({ error: "category must be a non-empty string" }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("transactions")
      .update({ category: category.trim() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[transactions] category update error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? "Unknown error" }, { status: 500 });
  }
}
