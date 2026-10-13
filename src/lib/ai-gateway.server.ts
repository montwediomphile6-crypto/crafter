import { createOpenAI } from "@ai-sdk/openai";

const RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  let runId: string | undefined;
  return createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: lovableApiKey,
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(RUN_ID_HEADER)) headers.set(RUN_ID_HEADER, runId);
      const res = await fetch(input, { ...init, headers });
      runId ??= res.headers.get(RUN_ID_HEADER)?.trim() || undefined;
      return res;
    },
  });
}

export function extractHtmlDocument(text: string) {
  const cleaned = stripFences(text);
  const start = cleaned.search(/<!DOCTYPE html>|<html[\s>]/i);
  const end = cleaned.toLowerCase().lastIndexOf("</html>");
  if (start === -1) return cleaned;
  return end > start ? cleaned.slice(start, end + 7) : cleaned.slice(start);
}

export const SITE_SYSTEM_PROMPT = `You are PromptForge, an expert front-end engineer that builds beautiful, single-file static websites.

RULES (strict):
- Reply with ONE complete HTML document and NOTHING else. No markdown fences, no commentary, no explanations before or after.
- The document must start with <!DOCTYPE html> and end with </html>.
- Everything inline: CSS in a single <style> tag, JS in a single <script> tag.
- No frameworks, no build steps, no local assets. The only allowed external resources are Google Fonts and the Tailwind CDN (https://cdn.tailwindcss.com). Images may use https://images.unsplash.com or inline SVG.
- Make it genuinely well designed: strong typography, coherent color palette, generous spacing, responsive layout, subtle animation and hover states. Never a generic Bootstrap look.
- Include realistic placeholder copy relevant to the request, and a sensible page structure (header/nav, hero, sections, footer) unless the user asks otherwise.
- Ensure it is fully self-contained and renders correctly inside an iframe.

When an existing document is provided, EDIT it to satisfy the new instruction, preserving everything the user did not ask to change, and return the FULL updated document.`;

export function stripFences(text: string) {
  let out = text.trim();
  out = out.replace(/^```[a-zA-Z]*\s*/, "");
  out = out.replace(/```\s*$/, "");
  return out.trim();
}
