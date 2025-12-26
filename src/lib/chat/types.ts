// TypeScript types for AI chat feature

export type MessageRole = 'user' | 'assistant' | 'system' | 'data' | 'tool'

export type MessagePartType = 'text' | 'tool-call' | 'tool-result'

export interface TextPart {
  type: 'text'
  text: string
}

export interface ToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

export interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
}

export type MessagePart = TextPart | ToolCallPart | ToolResultPart

export interface Message {
  id: string
  chatId: string
  role: MessageRole
  parts: MessagePart[]
  createdAt: Date
  updatedAt: Date
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
}

export interface Chat {
  id: string
  databaseId?: string
  title?: string
  createdAt: Date
  updatedAt: Date
}

export interface DatabaseContext {
  currentQuery?: string
  database?: string
  tables?: Array<{
    name: string
    columns: string[]
  }>
  clickHouseUser?: string
}

export interface ChatRequest {
  chatId: string
  messages: Array<{
    id: string
    role: MessageRole
    parts: MessagePart[]
  }>
  context?: DatabaseContext
}

// Storage interface for abstraction (localStorage now, IndexedDB later)
export interface ChatStorage {
  // Chat operations
  getChat(id: string): Promise<Chat | null>
  saveChat(chat: Chat): Promise<void>
  deleteChat(id: string): Promise<void>
  listChats(): Promise<Chat[]>

  // Message operations
  getMessages(chatId: string): Promise<Message[]>
  saveMessage(message: Message): Promise<void>
  deleteMessage(id: string): Promise<void>
  clearMessages(chatId: string): Promise<void>
}

