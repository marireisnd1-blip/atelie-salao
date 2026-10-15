# Primeiro acesso ao Supabase

Esta etapa conecta banco e login. Não exige WhatsApp, Anthropic ou worker.
Ainda não configura as regras definitivas do salão.

## 1. Criar um projeto exclusivo

No [Supabase Dashboard](https://supabase.com/dashboard), crie um projeto para o
Ateliê, preferindo uma região próxima da equipe. Guarde a senha do banco em um
gerenciador de senhas; não é necessário enviá-la pelo chat.

Use um projeto novo e vazio. Se já houver tabelas no projeto escolhido, confira
o conteúdo antes de aplicar qualquer SQL.

## 2. Criar a estrutura

No SQL Editor, execute uma única vez o conteúdo completo de
`supabase/migrations/202610150001_initial.sql`.

Essa migração cria as 13 tabelas, as funções e as políticas de acesso. A IA
começa pausada. Não execute novamente em um banco já inicializado.

Não execute `supabase/seed.sql` nesta primeira configuração: ele adiciona
profissionais, preços e expedientes fictícios. É possível entrar com o banco
vazio e cadastrar os dados reais depois.

Os valores iniciais de antecedência, janela de reservas e limites em
`salon_settings` são provisórios. Revise-os antes de operar com clientes.

## 3. Criar o acesso da administradora

Em Authentication, desative o cadastro público de usuários. Crie uma conta
individual com e-mail e senha pelo painel administrativo e confirme o e-mail
pelo fluxo do Supabase ou pela opção administrativa disponível no painel.

Copie o UUID dessa conta em Authentication → Users. Em uma nova consulta do SQL
Editor, substitua o UUID abaixo e execute:

```sql
insert into public.team_members (id, role)
values ('SUBSTITUA_PELO_UUID_DA_CONTA'::uuid, 'admin');
```

O UUID deve ser o da conta criada, não o ID do projeto. Login sem esse vínculo
não dá acesso ao salão. Execute o vínculo uma vez; se ele já existir, confira a
linha em `team_members` antes de alterar permissões.

## 4. Configurar o aplicativo

Preserve o `.env.local` existente. Preencha nele, ou no mecanismo seguro de
variáveis do ambiente:

```dotenv
APP_MODE=live
APP_ORIGIN=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICA
```

Use a origem exata pela qual o painel será acessado. Na implantação, substitua
`APP_ORIGIN` pela URL HTTPS publicada. Em Authentication → URL Configuration,
configure também a Site URL correspondente.

A URL e a chave publishable ficam nas configurações de API do projeto. Para
esta etapa de painel e login, não é necessário preencher a service role: o
painel usa a sessão individual e as políticas do banco. Credenciais privilegiadas
serão necessárias ao conectar o worker; não as envie pelo chat.

Reinicie o servidor sem o prefixo `APP_MODE=demo`, pois esse prefixo sobrepõe o
arquivo local. Em produção, recompile após configurar as variáveis públicas.

## 5. Validar o primeiro acesso

1. Abra o painel: ele deve levar ao login e não exibir o modo demonstração.
2. Entre com a conta criada. A agenda deve abrir vazia, com acesso administrativo.
3. Atualize a página para conferir a continuidade da sessão.
4. Confira em `salon_settings` que `ai_enabled` continua `false`.

Sem profissionais, serviços e expedientes, ainda não será possível reservar
horários. Isso é esperado nesta fase. Antes do piloto, valide também o isolamento
entre contas de funcionárias e administradora no Supabase real.

Aplicar SQL e preencher variáveis não comprova a integração: o login e a leitura
do painel precisam ser verificados no projeto real.
