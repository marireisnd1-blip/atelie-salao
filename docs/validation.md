# Validação da primeira versão

Verificações em 15/10/2026, na instância de desenvolvimento:

| Verificação                               | Resultado                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| TypeScript                                | Passou                                                                                |
| Testes unitários                          | 13 testes passaram                                                                    |
| PostgreSQL 16                             | 50 verificações passaram                                                              |
| Duas conexões concorrentes                | Exatamente uma reserva aceita na mesma vaga                                           |
| Chromium                                  | 3 cenários passaram, incluindo calendário, persistência, conversa, serviços e celular |
| Build de produção                         | Compilou                                                                              |
| Auditoria npm de dependências de produção | Nenhuma vulnerabilidade reportada na execução                                         |

O PostgreSQL local simula a identidade Supabase para exercitar RLS. Não foram validados, por falta de projeto e credenciais: Auth/Realtime no Supabase real, Anthropic, verificação do callback pela Meta, mensagens no WhatsApp ou implantação pública. Demonstração não representa um teste da IA.

Antes de habilitar atendimento real, repetir com contas individuais da equipe: isolamento pela API pública, disputa de horário, confirmação pelo número correto, pausa/transferência com mensagens em trânsito, opt-out, exclusão e restauração de backup. Usar primeiro número de teste da Meta e limites de gasto baixos.
