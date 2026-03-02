"use client";

import type { Chat, Message } from "@/lib/ai/chat-types";
import { useMemo, useSyncExternalStore } from "react";
import { v7 as uuidv7 } from "uuid";
import { chatActionStorage } from "./chat-action-storage";
import { sessionRepository } from "./local-session-repository";

export interface ManagedSession extends Chat {
  running: boolean;
}

type SessionState = {
  sessionsByConnection: Record<string, Record<string, ManagedSession>>;
  runningByChatId: Record<string, boolean>;
  version: number;
};

const state: SessionState = {
  sessionsByConnection: {},
  runningByChatId: {},
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

function toManagedSession(session: Chat, current?: ManagedSession): ManagedSession {
  return {
    ...session,
    running: current?.running ?? state.runningByChatId[session.chatId] ?? false,
  };
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

    const bucket = state.sessionsByConnection[connectionId] ?? {};
    return Object.values(bucket).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  async loadSessions(connectionId?: string): Promise<ManagedSession[]> {
    if (!connectionId) {
      return [];
    }

    const sessions = await sessionRepository.getSessionsForConnection(connectionId);
    const bucket = getConnectionBucket(connectionId);
    const previousChatIds = new Set(Object.keys(bucket));

    const nextBucket: Record<string, ManagedSession> = {};
    for (const session of sessions) {
      previousChatIds.delete(session.chatId);
      nextBucket[session.chatId] = toManagedSession(session, bucket[session.chatId]);
    }

    chatActionStorage.clearHiddenActionsForChats(Array.from(previousChatIds));
    state.sessionsByConnection[connectionId] = nextBucket;
    emitChange();
    return this.getSessions(connectionId);
  },

  async getSession(chatId: string): Promise<ManagedSession | null> {
    for (const bucket of Object.values(state.sessionsByConnection)) {
      if (bucket[chatId]) {
        return bucket[chatId]!;
      }
    }

    const session = await sessionRepository.getSession(chatId);
    if (!session) {
      return null;
    }

    const connectionId = session.databaseId;
    if (connectionId) {
      const bucket = getConnectionBucket(connectionId);
      bucket[chatId] = toManagedSession(session, bucket[chatId]);
      emitChange();
      return bucket[chatId]!;
    }

    return { ...session, running: false };
  },

  upsertSession(session: Chat): ManagedSession {
    const connectionId = session.databaseId;
    if (!connectionId) {
      return { ...session, running: state.runningByChatId[session.chatId] ?? false };
    }

    const bucket = getConnectionBucket(connectionId);
    bucket[session.chatId] = toManagedSession(session, bucket[session.chatId]);
    emitChange();
    return bucket[session.chatId]!;
  },

  async createSession(connectionId: string): Promise<ManagedSession> {
    const now = new Date();
    const session: Chat = {
      chatId: uuidv7(),
      databaseId: connectionId,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
    };

    await sessionRepository.saveSession(session);
    return this.upsertSession(session);
  },

  async getMessages(chatId: string): Promise<Message[]> {
    return sessionRepository.getMessages(chatId);
  },

  async saveMessages(chatId: string, messages: Message[]): Promise<void> {
    await sessionRepository.saveMessages(chatId, messages);
  },

  async saveMessage(chatId: string, message: Message): Promise<void> {
    await sessionRepository.saveMessage(chatId, message);
  },

  async getOrCreateSession(chatId: string, connectionId: string): Promise<ManagedSession> {
    const existing = await sessionRepository.getSession(chatId);
    if (existing) {
      return this.upsertSession(existing);
    }

    const now = new Date();
    const session: Chat = {
      chatId,
      databaseId: connectionId,
      createdAt: now,
      updatedAt: now,
    };

    await sessionRepository.saveSession(session);
    return this.upsertSession(session);
  },

  markRunning(connectionId: string | undefined, chatId: string, running: boolean) {
    if (!connectionId) {
      return;
    }

    const bucket = getConnectionBucket(connectionId);
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

  async renameSession(connectionId: string | undefined, chatId: string, title: string) {
    const current =
      (connectionId ? getConnectionBucket(connectionId)[chatId] : undefined) ??
      (await sessionRepository.getSession(chatId));

    if (!current) {
      return;
    }

    const nextSession: Chat = {
      ...current,
      title,
    };

    await sessionRepository.saveSession(nextSession);
    this.upsertSession(nextSession);
  },

  async deleteSessions(connectionId: string | undefined, chatIds: string[]) {
    await Promise.all(chatIds.map((chatId) => sessionRepository.deleteSession(chatId)));
    chatActionStorage.clearHiddenActionsForChats(chatIds);

    if (!connectionId) {
      emitChange();
      return;
    }

    const bucket = getConnectionBucket(connectionId);
    for (const chatId of chatIds) {
      delete state.runningByChatId[chatId];
      delete bucket[chatId];
    }
    emitChange();
  },

  async touchSession(session: Chat) {
    await sessionRepository.saveSession(session);
    this.upsertSession(session);
  },

  async touchSessionById(chatId: string, connectionId: string, title?: string) {
    const current = await this.getOrCreateSession(chatId, connectionId);
    const nextSession: Chat = {
      ...current,
      ...(title !== undefined ? { title } : {}),
      updatedAt: new Date(),
    };

    await sessionRepository.saveSession(nextSession);
    return this.upsertSession(nextSession);
  },
};

export function useSessions(connectionId?: string): ManagedSession[] {
  const version = useSyncExternalStore(
    SessionManager.subscribe,
    SessionManager.getVersion,
    SessionManager.getVersion
  );

  return useMemo(() => SessionManager.getSessions(connectionId), [connectionId, version]);
}
