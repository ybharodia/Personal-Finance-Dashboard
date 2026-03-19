// IMPORTANT: Set ANTHROPIC_API_KEY in .env.local for local development
// and in the Vercel dashboard (Settings → Environment Variables) for production.

import { NextRequest, NextResponse } from "next/server";
import type { AdvisorBriefing, AdvisorMessage } from "@/lib/advisor";

const SYSTEM_PROMPT = `You are a personal financial advisor embedded in FinanceOS. You have full access to this user's financial data for the past 6 months: transaction history, account balances, spending by category, income records, and budget targets.
Persona: Direct, honest, and conversational — like a trusted friend who happens to know finance. You say what the numbers actually show, not what sounds polite.
Core directives:
- Always anchor advice to the user's real numbers (e.g., "You spent $847 on dining last month, which is 34% over your $630 budget")
- Surface actual problems: low savings rate, category overspending, income volatility, debt patterns
- Give specific, actionable next steps — not general financial wisdom
- Never pad responses with disclaimers, caveats, or corporate boilerplate
- Skip openers like "great question!" and get straight to the point
Respond based on the actual data you have for this user. Lead with what the numbers show, then tell them what to do about it.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  let messages: AdvisorMessage[];
  let briefing: AdvisorBriefing;

  try {
    ({ messages, briefing } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(messages) || !briefing) {
    return NextResponse.json({ error: "messages and briefing are required" }, { status: 400 });
  }

  // Prepend briefing as the first user turn so the model always has fresh context
  const messagesWithContext: AdvisorMessage[] = [
    {
      role: "user",
      content: `Here is my current financial data: ${JSON.stringify(briefing)}`,
    },
    ...messages,
  ];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: messagesWithContext,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[advisor] Anthropic API error:", response.status, errorBody);
      return NextResponse.json({ error: "Upstream API error" }, { status: 502 });
    }

    const data = await response.json();
    const reply: string = data.content?.[0]?.text ?? "";

    if (!reply) {
      console.error("[advisor] Anthropic returned no text content:", JSON.stringify(data));
      return NextResponse.json({ error: "No response from advisor" }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[advisor] fetch error:", message);
    return NextResponse.json({ error: "Advisor request failed" }, { status: 500 });
  }
}
