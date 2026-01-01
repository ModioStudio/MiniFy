import {
  ArrowLeft,
  MusicNote,
  PaperPlaneRight,
  Robot,
  SpinnerGap,
  User,
  Waveform,
} from "@phosphor-icons/react";
import { generateText, type CoreMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import useWindowLayout from "../../hooks/useWindowLayout";
import {
  AI_DJ_SYSTEM_PROMPT,
  createAIModel,
  getActiveProviderWithKey,
} from "../../lib/aiClient";
import { readSettings } from "../../lib/settingLib";
import { spotifyTools } from "../../lib/spotifyTools";

type AIDJViewProps = {
  onBack: () => void;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  toolResults?: Array<{
    toolName: string;
    result: unknown;
  }>;
};

export default function AIDJView({ onBack }: AIDJViewProps) {
  const { setLayout } = useWindowLayout();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLayout("AIDJ");
  }, [setLayout]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 50;
    setShouldAutoScroll(isAtBottom);
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages, shouldAutoScroll]);

  useEffect(() => {
    (async () => {
      const settings = await readSettings();
      const provider = await getActiveProviderWithKey(
        settings.ai_providers,
        settings.active_ai_provider
      );
      setIsConfigured(provider !== null);

      if (provider) {
        setMessages([
          {
            id: "welcome",
            role: "assistant",
            content:
              "Hey! I'm your AI DJ. Tell me what kind of music you're in the mood for, or ask me to suggest something based on your recent listening history!",
            timestamp: new Date(),
          },
        ]);
      }
    })();
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const settings = await readSettings();
    const provider = await getActiveProviderWithKey(
      settings.ai_providers,
      settings.active_ai_provider
    );

    if (!provider) {
      setError("No AI provider configured. Please add one in Settings > Connections.");
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);
    setShouldAutoScroll(true);

    try {
      const model = createAIModel(provider.provider, provider.apiKey);

      const conversationMessages: CoreMessage[] = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      conversationMessages.push({
        role: "user",
        content: userMessage.content,
      });

      const result = await generateText({
        model,
        system: AI_DJ_SYSTEM_PROMPT,
        messages: conversationMessages,
        tools: spotifyTools,
        maxSteps: 5,
      });

      const toolResults: ChatMessage["toolResults"] = [];
      if (result.steps) {
        for (const step of result.steps) {
          if (step.toolResults) {
            for (const toolResult of step.toolResults) {
              toolResults.push({
                toolName: toolResult.toolName,
                result: toolResult.result,
              });
            }
          }
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.text,
        timestamp: new Date(),
        toolResults: toolResults.length > 0 ? toolResults : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get response";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (isConfigured === null) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <SpinnerGap size={32} className="animate-spin" style={{ color: "var(--settings-accent)" }} />
      </div>
    );
  }

  if (!isConfigured) {
    return (
      <div className="h-full w-full p-4" style={{ color: "var(--settings-text)" }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Waveform size={24} weight="fill" style={{ color: "var(--settings-accent)" }} />
            <h1 className="text-base font-semibold">AI DJ</h1>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} weight="bold" />
          </button>
        </div>

        <div
          className="h-[calc(100%-60px)] rounded-xl border flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{
            background: "var(--settings-panel-bg)",
            borderColor: "var(--settings-panel-border)",
          }}
        >
          <Robot size={64} weight="duotone" style={{ color: "var(--settings-text-muted)" }} />
          <h2 className="text-lg font-medium">AI DJ Not Configured</h2>
          <p className="text-sm text-[--settings-text-muted] max-w-sm">
            To use the AI DJ, you need to connect an AI provider first. Go to Settings
            → Connections and add an API key for OpenAI, Anthropic, Google AI, or Groq.
          </p>
          <button
            type="button"
            onClick={onBack}
            className="mt-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 hover:opacity-90"
            style={{
              background: "var(--settings-accent)",
              color: "#000",
            }}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full p-4 flex flex-col" style={{ color: "var(--settings-text)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Waveform size={24} weight="fill" style={{ color: "var(--settings-accent)" }} />
          <h1 className="text-base font-semibold">AI DJ</h1>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-full w-8 h-8 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} weight="bold" />
        </button>
      </div>

      <div
        className="flex-1 rounded-xl border overflow-hidden flex flex-col"
        style={{
          background: "var(--settings-panel-bg)",
          borderColor: "var(--settings-panel-border)",
        }}
      >
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-4"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{
                  background:
                    message.role === "assistant"
                      ? "var(--settings-accent)"
                      : "rgba(255, 255, 255, 0.1)",
                }}
              >
                {message.role === "assistant" ? (
                  <Robot size={18} weight="fill" color="#000" />
                ) : (
                  <User size={18} weight="fill" />
                )}
              </div>

              <div
                className={`max-w-[80%] ${message.role === "user" ? "text-right" : ""}`}
              >
                <div
                  className="inline-block px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background:
                      message.role === "assistant"
                        ? "rgba(255, 255, 255, 0.08)"
                        : "var(--settings-accent)",
                    color: message.role === "assistant" ? "var(--settings-text)" : "#000",
                    borderRadius:
                      message.role === "assistant"
                        ? "4px 18px 18px 18px"
                        : "18px 4px 18px 18px",
                  }}
                >
                  {message.content}
                </div>

                {message.toolResults && message.toolResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.toolResults.map((tr, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg inline-flex"
                        style={{
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "var(--settings-text-muted)",
                        }}
                      >
                        <MusicNote size={12} weight="fill" />
                        <span>
                          {tr.toolName === "playTrack" && "Now playing"}
                          {tr.toolName === "searchTracks" && "Searched tracks"}
                          {tr.toolName === "getRecentlyPlayed" && "Checked history"}
                          {tr.toolName === "getCurrentTrack" && "Checked current track"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className="text-xs mt-1"
                  style={{ color: "var(--settings-text-muted)" }}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--settings-accent)" }}
              >
                <Robot size={18} weight="fill" color="#000" />
              </div>
              <div
                className="px-4 py-3 rounded-2xl"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  borderRadius: "4px 18px 18px 18px",
                }}
              >
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "var(--settings-accent)", animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "var(--settings-accent)", animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: "var(--settings-accent)", animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div
            className="mx-4 mb-2 px-3 py-2 rounded-lg text-sm"
            style={{
              background: "rgba(239, 68, 68, 0.2)",
              color: "#ef4444",
            }}
          >
            {error}
          </div>
        )}

        <div className="p-3 border-t" style={{ borderColor: "var(--settings-panel-border)" }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask for music recommendations..."
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors"
              style={{
                background: "rgba(0, 0, 0, 0.2)",
                borderColor: "rgba(255, 255, 255, 0.1)",
                color: "var(--settings-text)",
              }}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
              style={{
                background: "var(--settings-accent)",
                color: "#000",
              }}
            >
              {isLoading ? (
                <SpinnerGap size={20} className="animate-spin" />
              ) : (
                <PaperPlaneRight size={20} weight="fill" />
              )}
            </button>
          </div>

          <div className="flex gap-2 mt-2 flex-wrap">
            {[
              "Play something based on my recent history",
              "Find me something upbeat",
              "What's playing now?",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setInput(suggestion)}
                className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:bg-white/10"
                style={{
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  color: "var(--settings-text-muted)",
                }}
                disabled={isLoading}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

