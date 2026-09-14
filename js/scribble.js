// Superfície de escrita com Apple Pencil que vira texto de verdade, direto
// no campo — nada de canvas, traço ou imagem. É só um <textarea> com
// inputmode="none": isso mantém o Scribble do iPadOS ativo (reconhece a
// escrita da Pencil e digita sozinho) mas sem abrir o teclado do sistema
// por cima (confirmado na prática: com inputmode="none" o teclado não
// aparece e o Scribble continua convertendo).
//
// Por ser um campo de texto de verdade, vem de graça o que o canvas do
// handwriting.js precisou construir na mão: desfazer (Cmd+Z / shake),
// colar, e rejeição de palma (o Scribble já trata isso no nível do
// sistema) — por isso não tem canetas, cores, espessura nem caixa de
// zoom aqui, eles não fazem sentido pra texto reconhecido.
const Scribble = (() => {
  let overlay = null;
  let textarea = null;
  let onSalvarCb = null;

  function fechar() {
    if (overlay) overlay.remove();
    overlay = null;
    textarea = null;
    onSalvarCb = null;
  }

  function salvar() {
    const cb = onSalvarCb;
    const valor = textarea.value;
    fechar();
    if (cb) cb(valor);
  }

  // `valorInicial` pré-carrega o texto que já existia no campo (a escrita
  // nova entra a partir do cursor, que começa no fim — não sobrescreve o
  // que já tinha sido digitado antes).
  function abrir({ titulo = 'Escrever com a Pencil', placeholder = '', valorInicial = '', onSalvar } = {}) {
    onSalvarCb = onSalvar;

    overlay = document.createElement('div');
    overlay.className = 'scr-overlay';
    overlay.innerHTML = `
      <div class="scr-header">
        <strong>${esc(titulo)}</strong>
        <button class="scr-fechar" type="button" aria-label="Fechar">✕</button>
      </div>
      <!-- spellcheck/autocorrect ligados (e lang travado em pt-BR) de propósito:
           o Scribble erra palavra de vez em quando, e é isso que deixa o
           sublinhado vermelho aparecer nelas — sem o sublinhado, um erro de
           reconhecimento passa batido até alguém reler com atenção. -->
      <textarea class="scr-textarea" inputmode="none" lang="pt-BR" autocorrect="on" spellcheck="true" placeholder="${esc(placeholder)}"></textarea>
      <div class="scr-actions">
        <button class="btn btn-ghost scr-cancelar" type="button">Cancelar</button>
        <button class="btn btn-primary scr-salvar" type="button">Salvar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    textarea = overlay.querySelector('.scr-textarea');
    textarea.value = valorInicial;
    textarea.addEventListener('contextmenu', (e) => e.preventDefault());

    overlay.querySelector('.scr-fechar').addEventListener('click', fechar);
    overlay.querySelector('.scr-cancelar').addEventListener('click', fechar);
    overlay.querySelector('.scr-salvar').addEventListener('click', salvar);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  return { abrir };
})();
window.Scribble = Scribble;
