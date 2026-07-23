import OpenAI from "openai";
import { NextResponse } from "next/server";
import { findKnowledgeAnswer, knowledgeAsPrompt } from "../../../../lib/assistant-knowledge";
import {
  buildCalculationBreakdown,
  formatCalculationAnswer,
  loadAssistantDataSnapshot
} from "../../../../lib/server/calculation-explanations";
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantPageContext
} from "../../../../types/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface ChatRequestBody {
  messages?: AssistantChatMessage[];
  context?: AssistantPageContext;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Nicht autorisierte Anfrage." }, { status: 403 });
  }

  let body: ChatRequestBody;
  try {
    body = await request.json() as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const messages = sanitizeMessages(body.messages);
  const question = messages.at(-1)?.content ?? "";
  if (!question) {
    return NextResponse.json({ error: "Bitte stelle eine Frage." }, { status: 400 });
  }
  const context = sanitizeContext(body.context);
  const knowledge = findKnowledgeAnswer(question);

  try {
    let snapshot: Awaited<ReturnType<typeof loadAssistantDataSnapshot>> | null = null;
    let databaseError: unknown = null;
    try {
      snapshot = await loadAssistantDataSnapshot();
    } catch (error) {
      databaseError = error;
    }

    if (!snapshot && requiresStoredData(question, context)) {
      throw databaseError ?? new Error("Datenbank nicht verfügbar.");
    }

    const breakdown = snapshot ? buildCalculationBreakdown(question, context, snapshot) : null;
    let answer: string;

    if (breakdown) {
      answer = formatCalculationAnswer(breakdown);
    } else {
      answer = await answerKnowledgeQuestion(question, context, knowledge?.answer ?? null);
    }

    const response: AssistantChatResponse = {
      answer,
      breakdown,
      suggestedQuestions: suggestedQuestions(context),
      context: {
        objectId: context.objectId ?? null,
        documentId: context.documentId ?? null,
        projectId: context.projectId ?? null,
        reportId: context.reportId ?? null,
        trade: context.target?.trade ?? context.trade ?? null
      }
    };
    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("[PARIBUS Assistent] Anfrage fehlgeschlagen", error);
    return NextResponse.json(
      {
        error: error instanceof Error && error.message === "DATABASE_URL ist nicht gesetzt."
          ? "Die Datenbankverbindung ist nicht konfiguriert. Datenabhängige Antworten sind deshalb nicht verfügbar."
          : "Die Daten konnten gerade nicht sicher geladen werden. Es wurde keine Antwort geschätzt."
      },
      { status: 503 }
    );
  }
}

async function answerKnowledgeQuestion(
  question: string,
  context: AssistantPageContext,
  matchedAnswer: string | null
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return matchedAnswer ??
      "Dazu finde ich in der hinterlegten Funktionsbeschreibung keine sichere Antwort. Frage mich zum Upload, zur Dokumentzuordnung, zu Objektberichten, Kostenbasen, Gewerken oder konkreten gespeicherten Werten.";
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 20000)
  });
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0,
    max_tokens: 450,
    messages: [
      {
        role: "system",
        content: [
          "Du bist der integrierte PARIBUS Baukosten-Assistent.",
          "Antworte kurz, verständlich und auf Deutsch.",
          "Nenne zuerst die konkrete Antwort und danach höchstens eine kurze Erläuterung.",
          "Verwende ausschließlich die folgende interne Wissensgrundlage.",
          "Erfinde keine Funktionen, Zahlen, Pfade, Dokumente oder Fachregeln.",
          "Wenn die Wissensgrundlage nicht reicht, sage offen, was fehlt.",
          "Konkrete gespeicherte Zahlen werden außerhalb dieses Sprachmodells deterministisch berechnet.",
          `Aktueller Seitenkontext: ${JSON.stringify({
            view: context.view,
            objectTab: context.objectTab,
            hasObject: Boolean(context.objectId),
            hasDocument: Boolean(context.documentId),
            hasProject: Boolean(context.projectId),
            hasReport: Boolean(context.reportId)
          })}.`,
          knowledgeAsPrompt(),
          matchedAnswer ? `Passender Wissenseintrag: ${matchedAnswer}` : ""
        ].filter(Boolean).join("\n\n")
      },
      {
        role: "user",
        content: question
      }
    ]
  });
  return response.choices[0]?.message.content?.trim() ||
    matchedAnswer ||
    "Dazu ist keine sichere Antwort in der Wissensgrundlage hinterlegt.";
}

function sanitizeMessages(value: unknown): AssistantChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-12)
    .flatMap((entry): AssistantChatMessage[] => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Partial<AssistantChatMessage>;
      if (item.role !== "user" && item.role !== "assistant") return [];
      const content = typeof item.content === "string" ? item.content.trim().slice(0, 2000) : "";
      if (!content) return [];
      return [{
        id: typeof item.id === "string" ? item.id.slice(0, 120) : crypto.randomUUID(),
        role: item.role,
        content,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
      }];
    });
}

function sanitizeContext(value: unknown): AssistantPageContext {
  const raw = value && typeof value === "object" ? value as AssistantPageContext : { view: "unknown" };
  const target = raw.target && typeof raw.target === "object"
    ? {
        label: safeText(raw.target.label, 180) || "Wert",
        metric: safeOptionalText(raw.target.metric, 120),
        calculation: raw.target.calculation,
        displayedValue: safeOptionalText(raw.target.displayedValue, 80),
        documentIds: Array.isArray(raw.target.documentIds)
          ? raw.target.documentIds.map((id) => safeText(id, 160)).filter(Boolean).slice(0, 250)
          : undefined,
        objectId: safeNullableText(raw.target.objectId, 160),
        projectId: safeNullableText(raw.target.projectId, 160),
        documentId: safeNullableText(raw.target.documentId, 160),
        reportId: safeNullableText(raw.target.reportId, 160),
        trade: safeNullableText(raw.target.trade, 120)
      }
    : null;
  return {
    view: safeText(raw.view, 80) || "unknown",
    objectTab: safeNullableText(raw.objectTab, 80),
    objectId: safeNullableText(raw.objectId, 160),
    projectId: safeNullableText(raw.projectId, 160),
    documentId: safeNullableText(raw.documentId, 160),
    reportId: safeNullableText(raw.reportId, 160),
    trade: safeNullableText(raw.trade, 120),
    target
  };
}

function suggestedQuestions(context: AssistantPageContext): string[] {
  if (context.documentId) {
    return [
      "Wie wurde der Bruttobetrag dieses Dokuments erkannt?",
      "Welche Positionen und Quellen sind gespeichert?",
      "Warum wurde dieses Dokument so zugeordnet?"
    ];
  }
  if (context.objectId) {
    return [
      "Wie setzen sich die Gesamtkosten dieses Objekts zusammen?",
      "Wie wurden die Kosten pro Wohnung berechnet?",
      "Welche Gewerke haben die höchsten Kosten?"
    ];
  }
  return [
    "Wie funktioniert das Tool?",
    "Wie erstelle ich einen Objektbericht?",
    "Welche Dokumente fließen in die Gesamtkosten ein?"
  ];
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  try {
    return new URL(origin).host === requestUrl.host;
  } catch {
    return false;
  }
}

function requiresStoredData(question: string, context: AssistantPageContext): boolean {
  if (context.target || context.objectId || context.documentId || context.projectId || context.reportId) return true;
  return /dies(?:er|es|e)|aktuell|konkret|betr[aä]gt|wert|betrag|gesamtsumme|aus welchen dokumenten|rechnungsposition|einzelposition|multiplikator verwendet|warum wurde.*zugeordnet/i.test(question);
}

function safeText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeOptionalText(value: unknown, maxLength: number): string | undefined {
  const text = safeText(value, maxLength);
  return text || undefined;
}

function safeNullableText(value: unknown, maxLength: number): string | null | undefined {
  if (value === null) return null;
  return safeOptionalText(value, maxLength);
}
