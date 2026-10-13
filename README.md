# Site Crafter

Build "PromptForge" — a simplified clone of Lovable's core app-builder loop, scoped to ONE output type: static single-page websites (HTML/CSS/JS only, no frameworks, no npm installs, no multi-file apps).

Core flow:
1. A clean chat-style UI: text input where a user describes a website they want ("landing page for a coffee shop", "portfolio site for a photographer", etc.)
2. On submit, call an LLM (via a Supabase edge function, using the Lovable AI Gateway / Claude) with a system prompt that instructs it to return ONLY a single self-contained HTML document (inline <style> and <script>, no external deps except Google Fonts/Tailwind CDN if needed) that implements the requested site.
3. Stream or return the generated HTML and render it live in an iframe (using srcdoc) next to the chat — this is the "live preview."
4. Support iteration: after the first generation, follow-up messages in the same chat should send the previous HTML + the new instruction back to the LLM so it edits/refines the existing site rather than starting over, and the preview updates.
5. Keep a left-hand sidebar list of "projects" (each project = one chat thread + its current HTML), so a user can start multiple site projects and switch between them, similar to Lovable/ChatGPT's sidebar.
6. Add a "Download HTML" button that exports the current generated site as a standalone .html file.
7. Store projects and message history in the database so they persist on reload (use Supabase, set up auth so each user only sees their own projects — simple email/password auth is fine).

Visual style: dark-mode-first, clean, modern SaaS aesthetic similar to Lovable/Vercel — not generic Bootstrap look. Chat panel on the left ~40% width, live preview iframe on the right ~60% width, with a header showing the project name and the download button.

Don't build multi-file/React generation, sandboxed code execution, or GitHub sync — those are explicitly out of scope for this MVP.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b0115856-898c-47f2-8820-3775c5b7c779).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
