import { NextResponse } from "next/server";
import { plaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

export async function POST() {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: "finance-dashboard-user" },
      client_name: "FinanceOS",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err: any) {
    const detail = err.response?.data ?? err.message;
    console.error("[plaid] create-link-token:", detail);
    return NextResponse.json({ error: "Failed to create link token", detail }, { status: 500 });
  }
}
