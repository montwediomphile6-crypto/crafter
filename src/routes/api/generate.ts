import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { streamText } from "ai";

import { createLovableAiGatewayProvider, SITE_SYSTEM_PROMPT } from "@/lib/ai-gateway.server";

type GenerateBody = {
  instruction?: string;
  currentHtml?: string | null;
  styleRules?: string | null;
};

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (!token) return new Response("Unauthorized", { status: 401 });

        const supabase = createClient(
          process.env["SUPABASE_URL"]!,
          process.env["SUPABASE_PUBLISHABLE_KEY"]!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: userData, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userData.user) return new Response("Unauthorized", { status: 401 });

        let body: GenerateBody;
        try {
          body = (await request.json()) as GenerateBody;
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }
        const instruction = (body.instruction ?? "").trim().slice(0, 8000);
        if (!instruction) return new Response("Missing instruction", { status: 400 });

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        const current = body.currentHtml?.trim();
        const rules = body.styleRules?.trim();
        const prompt =
          (rules ? `Style and layout rules for this site:\n${rules}\n\n---\n` : "") +
          (current
            ? `Here is the current website document:\n\n${current}\n\n---\nApply this change and return the full updated document:\n${instruction}`
            : `Build a single-page website for this request:\n${instruction}`);

        const gateway = createLovableAiGatewayProvider(apiKey);
        const result = streamText({
          model: gateway.responses("openai/gpt-6-astra"),
          system: SITE_SYSTEM_PROMPT,
          prompt,
          abortSignal: request.signal,
          maxRetries: 0,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
        });

        // Surface upstream failures (credits, rate limits) before streaming starts.
        const encoder = new TextEncoder();
        const iterator = result.fullStream[Symbol.asyncIterator]();
        let first: IteratorResult<(typeof result.fullStream extends AsyncIterable<infer T> ? T : never)>;
        try {
          for (;;) {
            first = await iterator.next();
            if (first.done) break;
            const part = first.value;
            if (part.type === "error") throw part.error;
            if (part.type === "text-delta") break;
          }
        } catch (error) {
          const status =
            (error as { statusCode?: number })?.statusCode ?? 500;
          const msg =
            status === 402
              ? "AI credits are used up. Add credits to keep generating."
              : status === 429
                ? "Too many requests right now. Please wait a moment and try again."
                : error instanceof Error
                  ? error.message
                  : "Generation failed";
          return new Response(msg, { status });
        }

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              if (!first.done && first.value.type === "text-delta") {
                controller.enqueue(encoder.encode(first.value.text));
              }
              for (;;) {
                const next = await iterator.next();
                if (next.done) break;
                if (next.value.type === "text-delta") controller.enqueue(encoder.encode(next.value.text));
                if (next.value.type === "error") throw next.value.error;
              }
              controller.close();
            } catch (err) {
              controller.error(err);
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        });
      },
    },
  },
});
