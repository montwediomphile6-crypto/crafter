import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/generate")({
  head: () => ({
    meta: [
      { title: "Site Generator — PromptForge" },
      {
        name: "description",
        content:
          "Pick a template type, fill in a few details, and PromptForge generates a complete single-page website.",
      },
      { property: "og:title", content: "Site Generator — PromptForge" },
      {
        property: "og:description",
        content:
          "Pick a template type, fill in a few details, and PromptForge generates a complete single-page website.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Generator,
});

type FieldDef = { key: string; label: string; placeholder: string };

type TemplateDef = {
  id: string;
  name: string;
  blurb: string;
  fields: FieldDef[];
  brief: string;
};

const TEMPLATES: TemplateDef[] = [
  {
    id: "landing",
    name: "Business landing",
    blurb: "Hero, features, and a call to action for a local business or service.",
    brief: "a landing page for a local business with a hero, services/features section, testimonial, and contact call-to-action",
    fields: [
      { key: "business", label: "Business name", placeholder: "e.g. Ember & Oak Coffee Roasters" },
      { key: "offer", label: "What you offer", placeholder: "e.g. small-batch specialty coffee and pastries" },
      { key: "location", label: "Location", placeholder: "e.g. Cape Town" },
      { key: "tone", label: "Tone", placeholder: "e.g. warm, artisanal, inviting" },
    ],
  },
  {
    id: "portfolio",
    name: "Portfolio",
    blurb: "Showcase creative work with a project grid, about section, and contact.",
    brief: "a portfolio site with a bold hero, a grid of 6 project cards, an about section, and a contact footer",
    fields: [
      { key: "name", label: "Your name", placeholder: "e.g. Naledi Mokoena" },
      { key: "craft", label: "Your craft", placeholder: "e.g. freelance photographer" },
      { key: "style", label: "Visual style", placeholder: "e.g. minimal, editorial, lots of whitespace" },
    ],
  },
  {
    id: "event",
    name: "Event page",
    blurb: "Date, venue, schedule, and RSVP for a launch, meetup, or wedding.",
    brief: "an event page with the date and venue in the hero, a schedule section, speaker/host highlights, and an RSVP call-to-action",
    fields: [
      { key: "event", label: "Event name", placeholder: "e.g. Startup Braai 2026" },
      { key: "when", label: "Date & venue", placeholder: "e.g. 14 Nov 2026, Kirstenbosch Gardens" },
      { key: "vibe", label: "Vibe", placeholder: "e.g. energetic, modern, celebratory" },
    ],
  },
  {
    id: "saas",
    name: "Product / SaaS",
    blurb: "Value proposition, feature highlights, pricing, and signup prompt.",
    brief: "a SaaS product page with a punchy hero, three feature blocks, a simple pricing table, and a signup call-to-action",
    fields: [
      { key: "product", label: "Product name", placeholder: "e.g. Ledgerly" },
      { key: "problem", label: "Problem it solves", placeholder: "e.g. invoicing for freelancers" },
      { key: "audience", label: "Target audience", placeholder: "e.g. independent designers" },
    ],
  },
];

function Generator() {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState<string>(TEMPLATES[0]?.id ?? "landing");
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = TEMPLATES.find((t) => t.id === templateId)!;

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const details = template.fields
        .map((f) => `${f.label}: ${(values[f.key] ?? "").trim() || "not specified"}`)
        .join("\n");
      const instruction =
        `Build ${template.brief}.\n\n${details}` +
        (extra.trim() ? `\n\nExtra requirements: ${extra.trim()}` : "");

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error("Your session expired. Please sign in again.");
      const userId = session.user.id;

      const name =
        (values[template.fields[0]?.key ?? ""] ?? "").trim() || `${template.name} site`;

      const { data: project, error: insertError } = await supabase
        .from("projects")
        .insert({ user_id: userId, name: name.slice(0, 60), html: "" })
        .select()
        .single();
      if (insertError) throw insertError;

      await supabase.from("messages").insert({
        project_id: project.id,
        user_id: userId,
        role: "user",
        content: instruction,
      });

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ instruction, currentHtml: null }),
      });
      if (!response.ok || !response.body) {
        throw new Error((await response.text()) || "Generation failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
      }
      const finalHtml = acc
        .replace(/^\s*```(?:html)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();

      await supabase
        .from("projects")
        .update({ html: finalHtml, updated_at: new Date().toISOString() })
        .eq("id", project.id);
      await supabase.from("messages").insert({
        project_id: project.id,
        user_id: userId,
        role: "assistant",
        content: `Generated a ${template.name.toLowerCase()} site from the template form.`,
      });

      navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-display text-lg font-bold">
          Prompt<span className="text-gradient">Forge</span>
        </span>
        <Link
          to="/app"
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to workspace
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="font-display text-3xl font-bold">Site generator</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a template type, fill in the details, and we will forge a complete single-page
          website you can refine in the workspace.
        </p>

        <form onSubmit={generate} className="mt-8 space-y-8">
          <fieldset>
            <legend className="mb-3 text-sm font-semibold">1. Choose a template</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    t.id === templateId
                      ? "border-ring bg-surface"
                      : "border-border hover:border-ring/50"
                  }`}
                >
                  <span className="text-sm font-semibold">{t.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{t.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-3 text-sm font-semibold">2. Fill in the details</legend>
            <div className="space-y-4">
              {template.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-xs text-muted-foreground">{f.label}</span>
                  <input
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">
                  Anything else? (optional)
                </span>
                <textarea
                  value={extra}
                  onChange={(e) => setExtra(e.target.value)}
                  placeholder="e.g. include a menu section, use dark mode, add an FAQ"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              </label>
            </div>
          </fieldset>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gradient-brand px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Forging your site…" : "Generate website"}
          </button>
        </form>
      </main>
    </div>
  );
}
