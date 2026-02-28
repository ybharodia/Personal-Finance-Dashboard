import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// POST /api/recurring/overrides
// Body: { merchant_key: string; is_recurring: boolean }
// Upserts an override row. Calling with is_recurring=false excludes the merchant;
// calling with is_recurring=true force-includes it.
export async function POST(request: Request) {
  console.log("[recurring/overrides] POST called");
  try {
    const { merchant_key, is_recurring } = await request.json() as {
      merchant_key: string;
      is_recurring: boolean;
    };

    console.log("[recurring/overrides] POST body:", { merchant_key, is_recurring });

    if (!merchant_key || typeof is_recurring !== "boolean") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("recurring_overrides")
      .upsert({ merchant_key, is_recurring }, { onConflict: "merchant_key" })
      .select();

    console.log("[recurring/overrides] POST upsert result:", { data, error });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[recurring/overrides] POST error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/recurring/overrides
// Body: { merchant_key: string }
// Removes the override entirely (goes back to auto-detection).
export async function DELETE(request: Request) {
  console.log("[recurring/overrides] DELETE called");
  try {
    const { merchant_key } = await request.json() as { merchant_key: string };

    if (!merchant_key) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = createAdminClient();
    const { error } = await db
      .from("recurring_overrides")
      .delete()
      .eq("merchant_key", merchant_key);

    console.log("[recurring/overrides] DELETE result:", { error });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[recurring/overrides] DELETE error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
