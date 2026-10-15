<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Desenvolvimento deste projeto

- Use o checkout existente. Cada tarefa cloud já é isolada; não crie worktrees sem pedido explícito.
- Leia o README para distinguir demonstração de integrações reais. Nunca trate dados de demonstração como validação de WhatsApp/IA.
- Use Node.js 24 e `npm ci`. Verificações: `npm run typecheck`, `npm test`, `npm run build`; quando alterar agenda/permissões, rode `npm run test:db`.
- Testes de navegador: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` neste ambiente. Use apenas servidor com `APP_MODE=demo`.
- Nunca exponha credenciais privilegiadas no cliente, em logs ou commits. Mantenha autorização e validação da agenda no banco/backend.
- Mudanças no banco vão em novas migrações; não reaplique a migração inicial em banco existente.
