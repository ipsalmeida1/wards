// Diálogos no próprio visual do app — substitui confirm()/prompt()/alert()
// nativos do navegador. Esses diálogos nativos quebravam a identidade visual
// do Wards (pílulas, cartão, Almond Cream) bem nos momentos de maior peso:
// dar alta, excluir um paciente de vez, avisos de erro/sucesso.
const Dialog = (() => {
  function montarOverlay(conteudoHtml) {
    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    overlay.innerHTML = `<div class="dlg-card">${conteudoHtml}</div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function fechar(overlay) {
    overlay.remove();
  }

  // Confirmação de uma ação (substitui confirm()). `perigoso` deixa o botão
  // de confirmar na cor de alerta — reservado pra ações destrutivas de
  // verdade (excluir, desfazer pareamento), não pra confirmações do dia a dia.
  function confirmar({ titulo = 'Confirmar', mensagem = '', textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', perigoso = false } = {}) {
    return new Promise((resolve) => {
      const overlay = montarOverlay(`
        <div class="dlg-titulo">${esc(titulo)}</div>
        <div class="dlg-mensagem">${esc(mensagem)}</div>
        <div class="dlg-acoes">
          <button class="btn btn-ghost dlg-cancelar" type="button">${esc(textoCancelar)}</button>
          <button class="btn ${perigoso ? 'btn-perigo' : 'btn-primary'} dlg-confirmar" type="button">${esc(textoConfirmar)}</button>
        </div>
      `);
      const resolver = (valor) => { fechar(overlay); resolve(valor); };
      overlay.querySelector('.dlg-cancelar').addEventListener('click', () => resolver(false));
      overlay.querySelector('.dlg-confirmar').addEventListener('click', () => resolver(true));
    });
  }

  // Pede um texto curto (substitui prompt()). Resolve com `null` se
  // cancelado, ou com a string (pode ser vazia) se confirmado — igual ao
  // contrato do prompt() nativo, pra não precisar mudar quem já checa
  // `=== null` no código que chama.
  function perguntar({ titulo = '', mensagem = '', valorInicial = '', placeholder = '', textoConfirmar = 'Salvar' } = {}) {
    return new Promise((resolve) => {
      const overlay = montarOverlay(`
        <div class="dlg-titulo">${esc(titulo)}</div>
        ${mensagem ? `<div class="dlg-mensagem">${esc(mensagem)}</div>` : ''}
        <input type="text" class="dlg-input" value="${esc(valorInicial)}" placeholder="${esc(placeholder)}">
        <div class="dlg-acoes">
          <button class="btn btn-ghost dlg-cancelar" type="button">Cancelar</button>
          <button class="btn btn-primary dlg-confirmar" type="button">${esc(textoConfirmar)}</button>
        </div>
      `);
      const input = overlay.querySelector('.dlg-input');
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      const enviar = () => { const v = input.value; fechar(overlay); resolve(v); };
      overlay.querySelector('.dlg-cancelar').addEventListener('click', () => { fechar(overlay); resolve(null); });
      overlay.querySelector('.dlg-confirmar').addEventListener('click', enviar);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enviar(); });
    });
  }

  // Aviso rápido, não-bloqueante (substitui alert()) — some sozinho, não
  // exige toque pra continuar. `tipo` só muda a cor da faixa lateral.
  function avisar(mensagem, { tipo = 'info' } = {}) {
    const toast = document.createElement('div');
    toast.className = `dlg-toast dlg-toast-${tipo}`;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('dlg-toast-visivel'));
    setTimeout(() => {
      toast.classList.remove('dlg-toast-visivel');
      setTimeout(() => toast.remove(), 250);
    }, 3200);
  }

  return { confirmar, perguntar, avisar };
})();

window.Dialog = Dialog;
