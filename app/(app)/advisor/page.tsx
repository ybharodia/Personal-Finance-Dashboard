import { buildAdvisorBriefing } from "@/lib/advisor";
import AdvisorClient from "@/components/AdvisorClient";

export const dynamic = "force-dynamic";

export default async function AdvisorPage() {
  const briefing = await buildAdvisorBriefing();
  return <AdvisorClient briefing={briefing} />;
}
