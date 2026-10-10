# Working with Viktor on agent/

- Viktor is a beginner learning to build AI agents. He's building the AI ordering agent for a hackathon vending-machine app, following "Viktor's Agent Build Guide" step by step.
- Teach, don't just do: before changing code, explain in plain language what you'll change and why. After changing it, explain the key lines.
- Only create or edit files inside agent/. Never touch other folders; teammates Todor and Kalin own them.
- Work happens on the git branch viktor/agent. Never commit to or push main, never force-push, never run git commands without asking first.
- Never read, print, or commit agent/.env or any API key.
- Stack: Node 24 running TypeScript directly (`node --env-file=.env file.ts`), `"type": "module"`, imports between files end in `.ts`, Anthropic SDK (`@anthropic-ai/sdk`), model `claude-sonnet-5`.
- Keep code simple and readable over clever. Ask before adding new npm packages.
