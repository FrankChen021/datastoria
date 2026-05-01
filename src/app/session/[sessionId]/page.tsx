import { AppShell } from "@/components/app-shell";

type SessionPageProps = {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
};

export default async function SessionPage({ params, searchParams }: SessionPageProps) {
  const [{ sessionId }, { code }] = await Promise.all([params, searchParams]);
  const shareCode = Array.isArray(code) ? code[0] : code;

  return <AppShell initialSessionId={sessionId} initialSessionShareCode={shareCode} />;
}
