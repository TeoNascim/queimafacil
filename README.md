# QueimaFácil

Sistema de gestão de torneios de queimada desenvolvido para a CoordEDF.

## Recursos

- autenticação e permissões por função;
- gestão de torneios, equipes, grupos e jogadores;
- cadastro e publicação de resultados;
- classificação automática com critérios oficiais de desempate;
- súmulas prontas para impressão;
- regulamento oficial integrado;
- painel público de resultados;
- armazenamento e segurança com Supabase.

## Configuração

Crie um arquivo `.env.local` a partir de `.env.example` e informe:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

Depois, instale as dependências e execute o projeto:

```bash
pnpm install
pnpm dev
```

## Banco de dados

As estruturas e políticas de segurança estão em `supabase/migrations`.

## Produção

O projeto pode ser publicado na Vercel como uma aplicação Next.js. As duas variáveis do Supabase devem ser cadastradas nas configurações do projeto na hospedagem.
