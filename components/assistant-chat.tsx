"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantExplainTarget,
  AssistantPageContext
} from "../types/assistant";

export const assistantExplainEvent = "paribus:explain-value";
export const assistantContextEvent = "paribus:assistant-context";
const sessionKey = "paribus-assistant-session-v1";

export function ExplainValueButton({
  target,
  className = ""
}: {
  target: AssistantExplainTarget;
  className?: string;
}) {
  return (
    <button
      className={`explainValueButton ${className}`.trim()}
      type="button"
      title={`${target.label} erklären`}
      aria-label={`${target.label} erklären`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent<AssistantExplainTarget>(assistantExplainEvent, { detail: target }));
      }}
    >
      <span aria-hidden="true">✦</span>
      Wert erklären
    </button>
  );
}

export function AssistantChat({ context }: { context: AssistantPageContext }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(defaultSuggestions);
  const [activeTarget, setActiveTarget] = useState<AssistantExplainTarget | null>(null);
  const [contextOverride, setContextOverride] = useState<Partial<AssistantPageContext>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const effectiveContext = useMemo(
    () => ({ ...context, ...contextOverride }),
    [context, contextOverride]
  );

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(sessionKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as AssistantChatMessage[];
      if (Array.isArray(parsed)) setMessages(parsed.slice(-40));
    } catch {
      sessionStorage.removeItem(sessionKey);
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(messages.slice(-40)));
    } catch {
      // Die Sitzung funktioniert auch ohne verfügbaren Session Storage.
    }
  }, [messages]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [isLoading, messages]);

  const sendQuestion = useCallback(async (
    rawQuestion: string,
    target: AssistantExplainTarget | null = activeTarget
  ) => {
    const question = rawQuestion.trim();
    if (!question || isLoading) return;
    const userMessage = createMessage("user", question);
    const outgoing = [...messages, userMessage].slice(-12);
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: outgoing,
          context: { ...effectiveContext, target }
        })
      });
      const data = await readAssistantResponse(response);
      setMessages((current) => [...current, createMessage("assistant", data.answer)]);
      setSuggestions(data.suggestedQuestions);
    } catch (error) {
      setMessages((current) => [
        ...current,
        createMessage(
          "assistant",
          error instanceof Error
            ? error.message
            : "Die Anfrage konnte nicht sicher beantwortet werden. Es wurde kein Wert geschätzt."
        )
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [activeTarget, effectiveContext, isLoading, messages]);

  useEffect(() => {
    const handleExplain = (event: Event) => {
      const target = (event as CustomEvent<AssistantExplainTarget>).detail;
      if (!target) return;
      setActiveTarget(target);
      setIsOpen(true);
      void sendQuestion(explainQuestion(target), target);
    };
    window.addEventListener(assistantExplainEvent, handleExplain);
    return () => window.removeEventListener(assistantExplainEvent, handleExplain);
  }, [sendQuestion]);

  useEffect(() => {
    setContextOverride({});
    setActiveTarget(null);
  }, [context.documentId, context.objectId, context.projectId, context.reportId, context.view]);

  useEffect(() => {
    const handleContext = (event: Event) => {
      const detail = (event as CustomEvent<Partial<AssistantPageContext>>).detail;
      if (detail && typeof detail === "object") setContextOverride((current) => ({ ...current, ...detail }));
    };
    window.addEventListener(assistantContextEvent, handleContext);
    return () => window.removeEventListener(assistantContextEvent, handleContext);
  }, []);

  const contextLabel = useMemo(() => {
    if (activeTarget?.trade) return `Gewerk: ${activeTarget.trade}`;
    if (effectiveContext.trade) return `Gewerk: ${effectiveContext.trade}`;
    if (effectiveContext.documentId) return "Aktuelles Dokument";
    if (effectiveContext.objectId) return "Aktuelles Objekt";
    if (effectiveContext.projectId) return "Aktuelles Projekt";
    if (effectiveContext.reportId) return "Aktueller Bericht";
    return "Portfolio";
  }, [
    activeTarget?.trade,
    effectiveContext.documentId,
    effectiveContext.objectId,
    effectiveContext.projectId,
    effectiveContext.reportId,
    effectiveContext.trade
  ]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(input);
  };

  return (
    <>
      <button
        className={`assistantLauncher${isOpen ? " assistantLauncherOpen" : ""}`}
        type="button"
        aria-label={isOpen ? "Assistent schließen" : "PARIBUS Assistent öffnen"}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span aria-hidden="true">✦</span>
        <strong>KI-Assistent</strong>
      </button>

      {isOpen ? (
        <aside className="assistantPanel" aria-label="PARIBUS Baukosten-Assistent">
          <header className="assistantHeader">
            <div>
              <span className="eyebrow">PARIBUS Baukosten KI</span>
              <h2>Werte & Funktionen erklären</h2>
              <p>{contextLabel}</p>
            </div>
            <button type="button" aria-label="Chat schließen" onClick={() => setIsOpen(false)}>×</button>
          </header>

          <div className="assistantMessages" ref={listRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="assistantWelcome">
                <span aria-hidden="true">✦</span>
                <strong>Wobei kann ich helfen?</strong>
                <p>Ich erkläre gespeicherte Kosten, Dokumentquellen, Positionen, Zuordnungen und die Bedienung des Tools.</p>
                <small>Konkrete Zahlen werden serverseitig aus den gespeicherten Daten berechnet.</small>
              </div>
            ) : null}
            {messages.map((message) => (
              <article className={`assistantMessage assistantMessage${message.role === "user" ? "User" : "Bot"}`} key={message.id}>
                <span>{message.role === "user" ? "Du" : "Assistent"}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {isLoading ? (
              <div className="assistantTyping" role="status">
                <i />
                <i />
                <i />
                <span>Daten und Rechenweg werden geprüft…</span>
              </div>
            ) : null}
          </div>

          <div className="assistantSuggestions">
            {suggestions.slice(0, 3).map((suggestion) => (
              <button key={suggestion} type="button" disabled={isLoading} onClick={() => void sendQuestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <form className="assistantComposer" onSubmit={submit}>
            <label htmlFor="assistant-question">Frage stellen</label>
            <div>
              <textarea
                id="assistant-question"
                value={input}
                rows={2}
                maxLength={2000}
                placeholder="z. B. Wie setzen sich die Elektrokosten zusammen?"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    if (input.trim()) void sendQuestion(input);
                  }
                }}
              />
              <button className="buttonPrimary" type="submit" disabled={isLoading || !input.trim()} aria-label="Frage senden">
                Senden
              </button>
            </div>
          </form>

          <footer className="assistantFooter">
            <span>Keine Schätzwerte</span>
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                setActiveTarget(null);
                setSuggestions(defaultSuggestions);
                sessionStorage.removeItem(sessionKey);
              }}
            >
              Verlauf leeren
            </button>
          </footer>
        </aside>
      ) : null}
    </>
  );
}

const defaultSuggestions = [
  "Wie funktioniert das Tool?",
  "Wie erstelle ich einen Objektbericht?",
  "Welche Dokumente fließen in die Gesamtkosten ein?"
];

function explainQuestion(target: AssistantExplainTarget): string {
  if (target.trade) return `Wie setzt sich der Wert für das Gewerk ${target.trade} zusammen?`;
  if (target.calculation === "costPerApartment") return `Wie wurde „${target.label}“ berechnet?`;
  if (target.calculation === "costPerSqm") return `Wie wurde „${target.label}“ berechnet?`;
  if (target.calculation === "assignment") return "Warum wurde dieses Dokument diesem Objekt beziehungsweise Projekt zugeordnet?";
  return `Wie setzt sich „${target.label}“${target.displayedValue ? ` (${target.displayedValue})` : ""} zusammen?`;
}

function createMessage(role: AssistantChatMessage["role"], content: string): AssistantChatMessage {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

async function readAssistantResponse(response: Response): Promise<AssistantChatResponse> {
  const data = await response.json().catch(() => null) as (AssistantChatResponse & { error?: string }) | null;
  if (!response.ok || !data?.answer) {
    throw new Error(data?.error || "Die Anfrage konnte nicht sicher beantwortet werden.");
  }
  return data;
}
