/**
 * Example Chat Panel Component
 * 
 * This is a reference implementation showing how to integrate the AI chat feature.
 * You can use this as-is or customize it to match your app's design.
 * 
 * Features:
 * - Real-time streaming responses
 * - Message history
 * - Error handling
 * - Loading states
 * - Markdown rendering (install react-markdown if you want this)
 */

'use client'

import { useChat } from '@ai-sdk/react'
import { useEffect, useState } from 'react'
import { createChat, setChatContextBuilder } from '@/lib/chat'
import type { Chat } from '@ai-sdk/react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, Send, AlertCircle } from 'lucide-react'

interface ChatPanelProps {
  // Optional: Pass in context from your app
  currentQuery?: string
  currentDatabase?: string
  availableTables?: Array<{
    name: string
    columns: string[]
  }>
}

function ChatPanelContent({ chat }: { chat: Chat<any> }) {
  const [input, setInput] = useState('')
  // @ts-ignore - useChat types might be outdated or custom
  const { messages, error, sendMessage, status } = useChat({ chat })

  const isStreaming = status === 'streaming' || status === 'submitted'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!chat || !input.trim()) {
      return
    }

    // Send message
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold">SQL Assistant</h2>
        <p className="text-sm text-muted-foreground">
          Ask questions about SQL, schemas, or query optimization
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="text-muted-foreground">
              <p className="font-medium">No messages yet</p>
              <p className="text-sm">Start a conversation with the SQL assistant</p>
            </div>

            {/* Suggested prompts */}
            <div className="space-y-2 w-full max-w-md">
              <p className="text-xs text-muted-foreground">Try asking:</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-left"
                onClick={() => setInput("Generate a SELECT query for the top 10 users")}
              >
                Generate a SELECT query for the top 10 users
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-left"
                onClick={() => setInput("Explain what this error means")}
              >
                Explain what this error means
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start text-left"
                onClick={() => setInput("How can I optimize this query?")}
              >
                How can I optimize this query?
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2 ${message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                    }`}
                >
                  {message.parts.map((part: any, i: number) => {
                    if (part.type === 'text') {
                      return (
                        <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                          {/* Basic text rendering - you can add react-markdown here */}
                          <pre className="whitespace-pre-wrap font-sans">{part.text}</pre>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive rounded-lg flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive">Error</p>
              <p className="text-sm text-destructive/80">{error.message}</p>
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about SQL, schemas, or query optimization..."
            className="flex-1 min-h-[80px] resize-none"
            disabled={isStreaming}
            onKeyDown={(e) => {
              // Submit on Cmd/Ctrl + Enter
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
          />
          <Button
            type="submit"
            disabled={isStreaming || !input.trim()}
            size="icon"
            className="h-auto"
          >
            {isStreaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2">
          Press {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'} + Enter to send
        </p>
      </div>
    </div>
  )
}

export function ChatPanel({
  currentQuery,
  currentDatabase,
  availableTables
}: ChatPanelProps) {
  const [chat, setChat] = useState<Chat<any> | null>(null)

  useEffect(() => {
    // Set up context builder
    // This provides ClickHouse-specific information to the AI
    setChatContextBuilder(() => ({
      currentQuery,
      database: currentDatabase,
      tables: availableTables,
    }))

    // Create chat instance
    // This loads any existing messages from localStorage
    createChat().then(setChat)
  }, [currentQuery, currentDatabase, availableTables])

  if (!chat) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return <ChatPanelContent chat={chat} />
}

/**
 * Usage Example:
 * 
 * import { ChatPanel } from '@/components/chat-panel/chat-panel.example'
 * 
 * function MyLayout() {
 *   const { query } = useQueryContext()
 *   const { connection } = useConnection()
 *   
 *   return (
 *     <ResizablePanelGroup direction="horizontal">
 *       <ResizablePanel>
 *         <SQLEditor />
 *       </ResizablePanel>
 *       <ResizableHandle />
 *       <ResizablePanel defaultSize={30} minSize={20}>
 *         <ChatPanel
 *           currentQuery={query}
 *           currentDatabase={connection.database}
 *           availableTables={connection.schema}
 *         />
 *       </ResizablePanel>
 *     </ResizablePanelGroup>
 *   )
 * }
 */

