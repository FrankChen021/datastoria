import { POST as agentPOST } from "@/app/api/ai/agent/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export function POST(req: Request) {
  return agentPOST(req);
}
