# Wards

Alternativa ao scaffold nativo em [`../Ronda/`](../Ronda/README.md), pra quando
você não tem Mac disponível. Roda inteiro no navegador — HTML/CSS/JS puro,
sem build, sem framework, sem dependência externa. Testei o fluxo completo
aqui mesmo (criar paciente, adicionar problema com categorização automática,
exame com labs, tendência, evolução, relatório mensal, dar alta, varredura
semanal de arquivamento, reabrir, e o app funcionando com o servidor
desligado de propósito pra confirmar que o offline é real).

## O que muda em relação ao nativo

| | Nativo (Swift) | PWA (este) |
|---|---|---|
| Roda em | Só Mac + Xcode | Qualquer navegador, sem instalar nada |
| Bloqueio de acesso | Face ID obrigatório | **Nenhum** — abre direto, sem PIN nem Face ID (a seu pedido) |
| Sincronizar iPhone ↔ iPad | Automático via CloudKit | **Não sincroniza sozinho** — cada aparelho guarda os dados dele |
| Offline | Nativo, garantido | Service worker cacheia o app inteiro; dados ficam no IndexedDB do navegador |

Dois pontos que importam pra decidir entre os dois:

- **Sem bloqueio de acesso.** Quem pegar o aparelho desbloqueado abre o app e
  vê os dados de paciente direto, sem Face ID nem PIN no meio. Isso foi
  removido a seu pedido — se mudar de ideia, é rápido eu trazer de volta um
  PIN simples (o código já existiu numa versão anterior).
- **A PWA não sincroniza entre o iPhone e o iPad sozinha.** Se você usar só
  num aparelho, não faz diferença. Se quiser os dois vendo o mesmo paciente,
  isso ficaria manual (exportar e reimportar) — não implementei ainda porque
  você não pediu.

## Como colocar no seu iPhone/iPad

Isto precisa estar hospedado em algum lugar com HTTPS pra funcionar de
verdade no Safari (o Service Worker exige HTTPS ou localhost — não funciona
abrindo o arquivo direto). A opção mais simples, sem precisar de Mac nem de
conta paga:

1. Crie uma conta grátis no [GitHub](https://github.com) se ainda não tiver.
2. Crie um repositório novo (pode ser privado) e suba os arquivos desta pasta
   (`index.html`, `manifest.webmanifest`, `service-worker.js`, `css/`, `js/`,
   `icons/`) na raiz do repositório.
3. Nas configurações do repositório → **Pages** → escolha a branch `main` e a
   pasta `/ (root)` → salve. Em alguns minutos o GitHub publica em algo como
   `https://seu-usuario.github.io/nome-do-repo/`.
4. Abra esse link no Safari do iPhone/iPad → toque em **Compartilhar** →
   **Adicionar à Tela de Início**. A partir daí abre como app, tela cheia,
   com o ícone do Wards.

Alternativa sem git/GitHub: arraste esta pasta pro
[app.netlify.com/drop](https://app.netlify.com/drop) — gera um link https
na hora, sem conta (o link some depois de um tempo sem conta; crie uma conta
grátis se quiser o link permanente).

## Primeira abertura

Abre direto na lista de pacientes — "+ Novo paciente" pra começar. Não tem
tela de configuração nem senha no caminho.

## Limitações conhecidas desta primeira versão

- **Sem bloqueio de acesso e sem sincronização entre aparelhos** (ambos
  explicados acima).
- **Anexos (foto/áudio/PDF) não implementados** — só texto e números por
  enquanto, igual ao scaffold nativo nesta primeira leva.
- **Export continua sendo o botão de imprimir** (🖨️ no topo da ficha do
  paciente) — abre o diálogo de impressão do navegador, que no iOS tem a
  opção "Salvar em Arquivos" como PDF. Não gera PDF programaticamente como
  o scaffold nativo faz.
- **Atualizar o app depois de hospedado**: se você mudar os arquivos e
  subir de novo, troque o texto `wards-v1` em `service-worker.js` pra
  `wards-v2` (e assim por diante) — é assim que o service worker sabe que
  precisa buscar os arquivos novos em vez de continuar servindo os antigos
  do cache.
- Reinternação de paciente já arquivado: hoje só existe "Reabrir" (volta a
  admissão antiga pro status ativo) — não cria uma ficha nova separada. Se
  preferir sempre uma ficha nova mesmo para o mesmo paciente, me avisa que eu
  ajusto.
