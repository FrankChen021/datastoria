"use client";

import type { Chat, Message } from "@/lib/ai/ai-types";
import { useMemo, useSyncExternalStore } from "react";
import { v7 as uuidv7 } from "uuid";
import {
  isNoConnectionSessionConnectionId,
  toSessionRepositoryConnectionId,
} from "./session-connection-id";
import type { SessionAccessOptions, SessionPageInput } from "./session-repository";
import { getSessionRepository } from "./session-repository-factory";

const MAX_SESSION_PAGE_LIMIT = 500;

export interface ManagedSession extends Chat {
  running: boolean;
  shareCode?: string;
}

type SessionState = {
  sessionsByConnection: Record<string, Record<string, ManagedSession>>;
  runningByChatId: Record<string, boolean>;
  loadingByConnection: Record<string, Promise<ManagedSession[]>>;
  allSessionsNextCursor: string | null;
  hasMoreAllSessions: boolean;
  allSessionsLoaded: boolean;
  loadingAllSessions: Promise<ManagedSession[]> | null;
  version: number;
};

const state: SessionState = {
  sessionsByConnection: {},
  runningByChatId: {},
  loadingByConnection: {},
  allSessionsNextCursor: null,
  hasMoreAllSessions: true,
  allSessionsLoaded: false,
  loadingAllSessions: null,
  version: 0,
};

const listeners = new Set<() => void>();

function emitChange() {
  state.version += 1;
  listeners.forEach((listener) => listener());
}

function getConnectionBucket(connectionId: string) {
  if (!state.sessionsByConnection[connectionId]) {
    state.sessionsByConnection[connectionId] = {};
  }
  return state.sessionsByConnection[connectionId]!;
}

function toManagedSession(
  session: Chat,
  current?: ManagedSession,
  options?: SessionAccessOptions
): ManagedSession {
  return {
    ...session,
    running: current?.running ?? state.runningByChatId[session.chatId] ?? false,
    ...((options?.shareCode ?? current?.shareCode)
      ? { shareCode: options?.shareCode ?? current?.shareCode }
      : {}),
  };
}

function findManagedSession(sessionId: string): ManagedSession | undefined {
  for (const bucket of Object.values(state.sessionsByConnection)) {
    if (bucket[sessionId]) {
      return bucket[sessionId]!;
    }
  }
  return undefined;
}

export const SessionManager = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getVersion() {
    return state.version;
  },

  getSessions(connectionId?: string): ManagedSession[] {
    if (!connectionId) {
      return [];
    }

    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const bucket = state.sessionsByConnection[repositoryConnectionId] ?? {};
    return Object.values(bucket).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  getAllSessions(): ManagedSession[] {
    return Object.values(state.sessionsByConnection)
      .flatMap((bucket) => Object.values(bucket))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  getAllSessionsPageInfo() {
    return {
      hasMore: state.hasMoreAllSessions,
      nextCursor: state.allSessionsNextCursor,
      loaded: state.allSessionsLoaded,
      loading: state.loadingAllSessions !== null,
    };
  },

  async loadSessions(
    input?: string | (SessionPageInput & { reset?: boolean })
  ): Promise<ManagedSession[]> {
    if (typeof input !== "string" && !input?.connectionId) {
      const reset = input?.reset ?? false;
      const limit = input?.limit ?? 100;

      if (state.loadingAllSessions) {
        return state.loadingAllSessions;
      }

      if (!reset && !state.hasMoreAllSessions && state.allSessionsLoaded) {
        return this.getAllSessions();
      }

      const storage = getSessionRepository();
      const cursor = reset ? null : (input?.cursor ?? state.allSessionsNextCursor);
      const loadPromise = (async () => {
        const page = await storage.getSessions({ limit, cursor });
        const nextBuckets = reset ? {} : { ...state.sessionsByConnection };

        for (const session of page.sessions) {
          const connectionId = session.databaseId;
          if (!connectionId) {
            continue;
          }

          const currentBucket = nextBuckets[connectionId] ?? {};
          nextBuckets[connectionId] = {
            ...currentBucket,
            [session.chatId]: toManagedSession(session, currentBucket[session.chatId]),
          };
        }

        state.sessionsByConnection = nextBuckets;
        state.allSessionsNextCursor = page.nextCursor;
        state.hasMoreAllSessions = page.nextCursor !== null;
        state.allSessionsLoaded = true;
        emitChange();
        return this.getAllSessions();
      })();

      state.loadingAllSessions = loadPromise;
      try {
        return await loadPromise;
      } finally {
        if (state.loadingAllSessions === loadPromise) {
          state.loadingAllSessions = null;
        }
      }
    }

    const connectionId = typeof input === "string" ? input : input.connectionId;
    if (!connectionId) {
      return [];
    }
    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const existingLoad = state.loadingByConnection[repositoryConnectionId];
    if (existingLoad) {
      return existingLoad;
    }

    const storage = getSessionRepository();
    const loadPromise = (async () => {
      const requestedLimit = input && typeof input !== "string" ? input.limit : undefined;
      const sessions = (
        await storage.getSessions({
          connectionId: repositoryConnectionId,
          limit: Math.min(requestedLimit ?? MAX_SESSION_PAGE_LIMIT, MAX_SESSION_PAGE_LIMIT),
          cursor: null,
        })
      ).sessions;
      const bucket = getConnectionBucket(repositoryConnectionId);
      const previousChatIds = new Set(Object.keys(bucket));

      const nextBucket: Record<string, ManagedSession> = {};
      for (const session of sessions) {
        previousChatIds.delete(session.chatId);
        nextBucket[session.chatId] = toManagedSession(session, bucket[session.chatId]);
      }

      state.sessionsByConnection[repositoryConnectionId] = nextBucket;
      emitChange();
      return this.getSessions(connectionId);
    })();

    state.loadingByConnection[repositoryConnectionId] = loadPromise;
    try {
      return await loadPromise;
    } finally {
      if (state.loadingByConnection[repositoryConnectionId] === loadPromise) {
        delete state.loadingByConnection[repositoryConnectionId];
      }
    }
  },

  async getSession(
    sessionId: string,
    options?: SessionAccessOptions
  ): Promise<ManagedSession | null> {
    const cached = findManagedSession(sessionId);
    if (cached && (!options?.shareCode || cached.shareCode === options.shareCode)) {
      return cached;
    }

    const storage = getSessionRepository();
    const session = await storage.getSession(sessionId, options);
    if (!session) {
      return null;
    }

    const connectionId = session.databaseId;
    if (connectionId) {
      const bucket = getConnectionBucket(connectionId);
      bucket[sessionId] = toManagedSession(session, bucket[sessionId], options);
      emitChange();
      return bucket[sessionId]!;
    }

    return {
      ...session,
      running: false,
      ...(options?.shareCode ? { shareCode: options.shareCode } : {}),
    };
  },

  upsertSession(session: Chat): ManagedSession {
    const connectionId = session.databaseId;
    if (!connectionId) {
      return {
        ...session,
        running: state.runningByChatId[session.chatId] ?? false,
      };
    }

    const bucket = getConnectionBucket(connectionId);
    bucket[session.chatId] = toManagedSession(session, bucket[session.chatId]);
    emitChange();
    return bucket[session.chatId]!;
  },

  async createSession(connectionId: string): Promise<ManagedSession> {
    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const now = new Date();
    const session: Chat = {
      chatId: uuidv7(),
      databaseId: repositoryConnectionId,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
    };

    const storage = getSessionRepository();
    await storage.saveSession(session);
    return this.upsertSession(session);
  },

  async getMessages(sessionId: string, options?: SessionAccessOptions): Promise<Message[]> {
    const storage = getSessionRepository();
    return storage.getMessages(sessionId, options);
  },

  async createSessionFromMessages(
    connectionId: string,
    messages: Message[],
    title?: string,
    sessionId?: string
  ): Promise<ManagedSession> {
    const storage = getSessionRepository();
    const session = await storage.createSessionFromMessages({
      connectionId: toSessionRepositoryConnectionId(connectionId),
      sessionId,
      title,
      messages,
    });
    return this.upsertSession(session);
  },

  async saveMessages(sessionId: string, messages: Message[]): Promise<void> {
    const storage = getSessionRepository();
    await storage.saveMessages(sessionId, messages);
  },

  async saveMessage(sessionId: string, message: Message): Promise<void> {
    const storage = getSessionRepository();
    await storage.saveMessage(sessionId, message);
  },

  async getOrCreateSession(
    sessionId: string,
    connectionId: string,
    options?: SessionAccessOptions
  ): Promise<ManagedSession> {
    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const storage = getSessionRepository();
    const existing = await storage.getSession(sessionId, options);
    if (existing) {
      const bucket = getConnectionBucket(existing.databaseId ?? repositoryConnectionId);
      bucket[sessionId] = toManagedSession(existing, bucket[sessionId], options);
      emitChange();
      return bucket[sessionId]!;
    }

    const now = new Date();
    const session: Chat = {
      chatId: sessionId,
      databaseId: repositoryConnectionId,
      createdAt: now,
      updatedAt: now,
    };

    await storage.saveSession(session);
    const bucket = getConnectionBucket(repositoryConnectionId);
    bucket[sessionId] = toManagedSession(session, bucket[sessionId], options);
    emitChange();
    return bucket[sessionId]!;
  },

  markRunning(connectionId: string | undefined, chatId: string, running: boolean) {
    if (!connectionId) {
      return;
    }

    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const bucket = getConnectionBucket(repositoryConnectionId);
    const existing = bucket[chatId];
    if (!existing) {
      state.runningByChatId[chatId] = running;
      emitChange();
      return;
    }

    if (existing.running === running) {
      state.runningByChatId[chatId] = running;
      return;
    }

    state.runningByChatId[chatId] = running;
    bucket[chatId] = {
      ...existing,
      running,
    };
    emitChange();
  },

  async renameSession(sessionId: string, title: string) {
    const storage = getSessionRepository();
    const current = await this.getSession(sessionId);

    if (!current) {
      return;
    }

    const nextSession: Chat = {
      ...current,
      title,
    };

    await storage.renameSession(sessionId, title, { shareCode: current.shareCode });
    this.upsertSession(nextSession);
  },

  async deleteSessions(chatIds: string[]) {
    const storage = getSessionRepository();
    await Promise.all(
      chatIds.map((chatId) =>
        storage.deleteSession(chatId, { shareCode: findManagedSession(chatId)?.shareCode })
      )
    );

    for (const chatId of chatIds) {
      for (const bucket of Object.values(state.sessionsByConnection)) {
        delete bucket[chatId];
      }
      delete state.runningByChatId[chatId];
    }
    emitChange();
  },

  async touchSession(session: Chat) {
    const storage = getSessionRepository();
    await storage.saveSession(session);
    this.upsertSession(session);
  },

  async touchSessionById(
    sessionId: string,
    connectionId: string,
    title?: string,
    options?: SessionAccessOptions
  ) {
    const current = await this.getOrCreateSession(sessionId, connectionId, options);
    const repositoryConnectionId = toSessionRepositoryConnectionId(connectionId);
    const shouldBackfillConnectionId =
      !current.databaseId ||
      current.databaseId.trim() === "" ||
      isNoConnectionSessionConnectionId(current.databaseId);
    const nextSession: Chat = {
      ...current,
      ...(shouldBackfillConnectionId && !isNoConnectionSessionConnectionId(repositoryConnectionId)
        ? { databaseId: repositoryConnectionId }
        : {}),
      ...(title !== undefined ? { title } : {}),
      updatedAt: new Date(),
    };

    const storage = getSessionRepository();
    await storage.saveSession(nextSession);
    const bucket = getConnectionBucket(nextSession.databaseId ?? repositoryConnectionId);
    bucket[sessionId] = toManagedSession(nextSession, bucket[sessionId], options);
    emitChange();
    return bucket[sessionId]!;
  },
};

export function useSessions(
  connectionId?: string,
  scope: "connection" | "all" = "connection"
): ManagedSession[] {
  const snapshotVersion = useSyncExternalStore(
    SessionManager.subscribe,
    SessionManager.getVersion,
    SessionManager.getVersion
  );

  return useMemo(() => {
    void snapshotVersion;
    return scope === "all"
      ? SessionManager.getAllSessions()
      : SessionManager.getSessions(connectionId);
  }, [connectionId, scope, snapshotVersion]);
}

export function useSessionPageInfo() {
  const snapshotVersion = useSyncExternalStore(
    SessionManager.subscribe,
    SessionManager.getVersion,
    SessionManager.getVersion
  );

  return useMemo(() => {
    void snapshotVersion;
    return SessionManager.getAllSessionsPageInfo();
  }, [snapshotVersion]);
}
