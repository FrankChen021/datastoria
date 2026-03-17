import { getRuntimeConfig } from "@/components/runtime-config-provider";
import { LocalSessionRepository } from "./local-session-repository";
import { RemoteSessionRepository } from "./remote-session-repository";
import type { SessionRepository } from "./session-repository";

const localSessionRepository = new LocalSessionRepository();
const remoteSessionRepository = new RemoteSessionRepository();

export function getSessionRepository(): SessionRepository {
  const mode = getRuntimeConfig().sessionRepositoryType;
  return mode === "remote" ? remoteSessionRepository : localSessionRepository;
}
