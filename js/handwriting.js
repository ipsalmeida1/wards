// Canvas de escrita à mão (Apple Pencil via Pointer Events) — sem dependência
// externa, pra não quebrar o funcionamento 100% offline do app. O traço com
// espessura variável é feito desenhando cada segmento com lineWidth
// proporcional à pressão média dos dois pontos, em vez de usar a lib
// perfect-freehand (que exigiria CDN/bundler que este projeto não tem).
//
// Ferramentas: caneta, marca-texto (traço largo translúcido, sem variar
// pela pressão) e borracha (destination-out — apaga só o que o dedo/Pencil
// tocar, não o traço inteiro, ao contrário do botão "Desfazer"). Desfazer e
// Refazer funcionam replayando o histórico de traços do zero, então a
// borracha entra nesse histórico como só mais um tipo de traço.
//
// Caixinha de zoom: um "espelho" ampliado de uma região pequena do papel —
// escreve-se grande dentro dela e o traço é commitado pequeno (de verdade)
// no canvas principal, na posição espelhada. Depois de cada traço a região
// avança sozinha pra direita (e quebra linha ao chegar na borda), do jeito
// que o Notas do iPad faz.
const Handwriting = (() => {
  const CORES = ['#1a1a1a', '#1d4ed8', '#b03a2e', '#2f6f4f'];
  const COR_PAUTA = '#e0cfb8';
  const ESPACO_LINHA = 34;
  const MARGEM = 10;
  const ZOOM_FATOR = 3;
  const ZOOM_HEADER_ALTURA = 28; // bate com .hw-zoom-header no CSS
  const ZOOM_LINHAS_VISIVEIS = 3;

  let overlay = null;
  let canvas, canvasWrap, ctx, dpr, larguraCss, alturaCss;
  let strokes = [];
  let redoStack = [];
  let corAtual = CORES[0];
  let tamanhoAtual = 4;
  let ferramentaAtual = 'lapis';
  let desenhando = false;
  let ponteiroAtivo = null; // pointerId de quem está desenhando agora — ignora qualquer outro ponteiro (ex.: palma) até soltar
  let onSaveCb = null;

  // ---- zoom ----
  let zoomAtivo = false;
  let zoomEl, zoomCanvas, zoomCtx, zoomDpr;
  let sourceRect = { x: MARGEM, y: MARGEM, w: 140, h: 46 };
  let sourceRectPronto = false;
  let arrastandoZoom = null;

  function configurarCanvas(cnv) {
    const d = window.devicePixelRatio || 1;
    const rect = cnv.getBoundingClientRect();
    cnv.width = rect.width * d;
    cnv.height = rect.height * d;
    const c = cnv.getContext('2d');
    c.scale(d, d);
    return { ctx: c, dpr: d, w: rect.width, h: rect.height };
  }

  // O papel pautado é só CSS (background-image) no canvas principal — não
  // faz parte do bitmap desenhado. Antes as linhas eram desenhadas aqui
  // dentro, e a borracha (destination-out) apagava um pedaço delas junto
  // com a tinta; separando em camadas, apagar só mexe na tinta.
  function desenharFundo() {
    ctx.clearRect(0, 0, larguraCss, alturaCss);
  }

  // Reaproveitado pra desenhar a pauta em qualquer contexto — o composto
  // final ao salvar (precisa das linhas "de verdade" no PNG exportado) e o
  // espelho do zoom (ampliado, alinhado à posição atual do sourceRect).
  function desenharLinhasPauta(targetCtx, largura, altura, larguraLinha) {
    targetCtx.strokeStyle = COR_PAUTA;
    targetCtx.lineWidth = larguraLinha;
    for (let y = ESPACO_LINHA; y < altura; y += ESPACO_LINHA) {
      targetCtx.beginPath();
      targetCtx.moveTo(0, y + larguraLinha / 2);
      targetCtx.lineTo(largura, y + larguraLinha / 2);
      targetCtx.stroke();
    }
  }

  function estilosFerramenta(ferramenta, cor, tamanho, pressaoMedia) {
    if (ferramenta === 'borracha') {
      return { op: 'destination-out', alpha: 1, largura: Math.max(6, tamanho * 4), cor: '#000' };
    }
    if (ferramenta === 'marcador') {
      return { op: 'source-over', alpha: 0.35, largura: Math.max(8, tamanho * 3), cor };
    }
    if (ferramenta === 'caneta') {
      // Mesma variação por pressão do lápis, só que bem mais grossa na base.
      return { op: 'source-over', alpha: 1, largura: Math.max(2, tamanho * pressaoMedia * 2.2), cor };
    }
    return { op: 'source-over', alpha: 1, largura: Math.max(1, tamanho * pressaoMedia), cor }; // lápis
  }

  function desenharSegmento(a, b, cor, tamanho, ferramenta) {
    const pressaoMedia = (a[2] + b[2]) / 2;
    const est = estilosFerramenta(ferramenta, cor, tamanho, pressaoMedia);
    ctx.save();
    ctx.globalCompositeOperation = est.op;
    ctx.globalAlpha = est.alpha;
    ctx.strokeStyle = est.cor;
    ctx.lineWidth = est.largura;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    ctx.restore();
  }

  function redesenharTudo() {
    desenharFundo();
    for (const s of strokes) {
      for (let i = 1; i < s.pontos.length; i++) {
        desenharSegmento(s.pontos[i - 1], s.pontos[i], s.cor, s.tamanho, s.ferramenta);
      }
    }
    if (zoomAtivo) atualizarEspelhoZoom();
  }

  function ptFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const pressao = e.pressure > 0 ? e.pressure : 0.5;
    return [e.clientX - rect.left, e.clientY - rect.top, pressao];
  }

  function onPointerDown(e) {
    if (zoomAtivo) return;
    if (e.pointerType === 'touch') return; // rejeição de palma: só Pencil (pen) ou mouse desenham
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    ponteiroAtivo = e.pointerId;
    desenhando = true;
    redoStack = [];
    strokes.push({ pontos: [ptFromEvent(e)], cor: corAtual, tamanho: tamanhoAtual, ferramenta: ferramentaAtual });
  }

  function onPointerMove(e) {
    if (zoomAtivo || !desenhando || e.pointerId !== ponteiroAtivo) return;
    const stroke = strokes[strokes.length - 1];
    const novo = ptFromEvent(e);
    const anterior = stroke.pontos[stroke.pontos.length - 1];
    stroke.pontos.push(novo);
    desenharSegmento(anterior, novo, stroke.cor, stroke.tamanho, stroke.ferramenta);
  }

  function onPointerUp(e) {
    if (e.pointerId !== ponteiroAtivo) return;
    desenhando = false;
    ponteiroAtivo = null;
  }

  function undo() {
    if (!strokes.length) return;
    redoStack.push(strokes.pop());
    redesenharTudo();
  }

  function redo() {
    if (!redoStack.length) return;
    strokes.push(redoStack.pop());
    redesenharTudo();
  }

  function limpar() {
    strokes = [];
    redoStack = [];
    desenharFundo();
    if (zoomAtivo) atualizarEspelhoZoom();
  }

  function fechar() {
    if (overlay) overlay.remove();
    overlay = null;
    strokes = [];
    redoStack = [];
    zoomAtivo = false;
    zoomEl = null;
    zoomCanvas = null;
    zoomCtx = null;
    sourceRectPronto = false;
    arrastandoZoom = null;
  }

  // O canvas principal só tem tinta (a pauta é CSS) — pra exportar um PNG
  // que pareça a mesma folha, compõe um canvas à parte com a pauta desenhada
  // de verdade por baixo, e a tinta por cima.
  function salvar() {
    const composto = document.createElement('canvas');
    composto.width = canvas.width;
    composto.height = canvas.height;
    const cctx = composto.getContext('2d');
    cctx.scale(dpr, dpr);
    desenharLinhasPauta(cctx, larguraCss, alturaCss, 1);
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.drawImage(canvas, 0, 0);

    // Manda também o histórico de traços (não só o PNG achatado) — é isso
    // que permite reabrir a mesma anotação depois e continuar editando de
    // verdade (desfazer, apagar traço antigo, etc.), em vez de só desenhar
    // por cima de uma imagem congelada.
    const tracosJson = JSON.parse(JSON.stringify(strokes));
    composto.toBlob((blob) => {
      const cb = onSaveCb;
      fechar();
      if (blob && cb) cb(blob, tracosJson);
    }, 'image/png');
  }

  // ---- caixinha de zoom ----

  function atualizarEspelhoZoom() {
    if (!zoomCtx) return;
    const largura = zoomCanvas.clientWidth, altura = zoomCanvas.clientHeight;
    zoomCtx.clearRect(0, 0, largura, altura);
    // pauta ampliada, alinhada com a posição real de sourceRect — desenhada
    // de novo aqui (não é a mesma camada do canvas principal), então a
    // borracha nunca a atinge, só o traço passa por cima dela.
    zoomCtx.save();
    zoomCtx.strokeStyle = COR_PAUTA;
    zoomCtx.lineWidth = ZOOM_FATOR;
    const primeiraLinha = Math.ceil(sourceRect.y / ESPACO_LINHA) * ESPACO_LINHA;
    for (let yReal = primeiraLinha; yReal < sourceRect.y + sourceRect.h; yReal += ESPACO_LINHA) {
      const yLocal = (yReal - sourceRect.y) * ZOOM_FATOR;
      zoomCtx.beginPath();
      zoomCtx.moveTo(0, yLocal);
      zoomCtx.lineTo(largura, yLocal);
      zoomCtx.stroke();
    }
    zoomCtx.restore();
    zoomCtx.drawImage(
      canvas,
      sourceRect.x * dpr, sourceRect.y * dpr, sourceRect.w * dpr, sourceRect.h * dpr,
      0, 0, largura, altura
    );
  }

  // Mantém a posição da caixa NA TELA em dia com o que ela está espelhando —
  // sem isso, o avanço automático (linha abaixo) só mexia no sourceRect, e a
  // caixa ficava parada onde estava, com o conteúdo mudando por baixo: a
  // continuação da palavra some longe da posição em que ela estava sendo
  // escrita, fora do que a mão via na tela.
  function sincronizarCaixaComSourceRect() {
    if (!zoomEl) return;
    const topMax = Math.max(0, alturaCss - zoomEl.clientHeight);
    zoomEl.style.top = Math.max(0, Math.min(sourceRect.y, topMax)) + 'px';
  }

  function avancarSourceRect() {
    sourceRect.x += sourceRect.w;
    if (sourceRect.x + sourceRect.w + MARGEM > larguraCss) {
      sourceRect.x = MARGEM;
      sourceRect.y += ESPACO_LINHA;
    }
    if (sourceRect.y + sourceRect.h + MARGEM > alturaCss) {
      sourceRect.y = alturaCss - sourceRect.h - MARGEM;
    }
    sincronizarCaixaComSourceRect();
  }

  function ptFromZoomEvent(e) {
    const rect = zoomCanvas.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const pressao = e.pressure > 0 ? e.pressure : 0.5;
    return [sourceRect.x + localX / ZOOM_FATOR, sourceRect.y + localY / ZOOM_FATOR, pressao];
  }

  // Só avança a janela ANTES de um traço novo que já começa perto da borda
  // direita da caixa — não a cada traço solto. Levantar a Pencil entre
  // letras/palavras (escrita normal) é constante; avançar a cada levantada
  // fazia cada letra mirar num trecho diferente da página real, quebrando a
  // continuidade de escrever várias letras seguidas na mesma linha.
  function precisaAvancarAntesDe(localX) {
    return localX > zoomCanvas.clientWidth * 0.82;
  }

  function onZoomPointerDown(e) {
    if (e.pointerType === 'touch') return; // rejeição de palma
    e.preventDefault();
    zoomCanvas.setPointerCapture(e.pointerId);
    ponteiroAtivo = e.pointerId;

    const rect = zoomCanvas.getBoundingClientRect();
    if (precisaAvancarAntesDe(e.clientX - rect.left)) {
      avancarSourceRect();
      atualizarEspelhoZoom();
    }

    desenhando = true;
    redoStack = [];
    strokes.push({ pontos: [ptFromZoomEvent(e)], cor: corAtual, tamanho: tamanhoAtual / ZOOM_FATOR, ferramenta: ferramentaAtual });
  }

  function onZoomPointerMove(e) {
    if (!desenhando || e.pointerId !== ponteiroAtivo) return;
    const stroke = strokes[strokes.length - 1];
    const novo = ptFromZoomEvent(e);
    const anterior = stroke.pontos[stroke.pontos.length - 1];
    stroke.pontos.push(novo);
    desenharSegmento(anterior, novo, stroke.cor, stroke.tamanho, stroke.ferramenta);
    atualizarEspelhoZoom();
  }

  function onZoomPointerUp(e) {
    if (e.pointerId !== ponteiroAtivo) return;
    desenhando = false;
    ponteiroAtivo = null;
  }

  function posicionarZoomPadrao() {
    // Altura = 3 linhas de pauta (ESPACO_LINHA) vistas ampliadas, mais o
    // cabeçalho da caixa — assim ela sempre mostra 3 linhas de conteúdo real,
    // não um valor de pixel arbitrário. Largura = a largura toda do aparelho
    // (o overlay não fica preso ao max-width de 620px do #app, então
    // larguraCss já é a tela inteira, iPhone ou iPad) — sem sobra nas
    // laterais, de encosto a encosto.
    const alturaDesejada = ZOOM_LINHAS_VISIVEIS * ESPACO_LINHA * ZOOM_FATOR + ZOOM_HEADER_ALTURA;
    const boxH = Math.min(alturaCss - 32, alturaDesejada);
    zoomEl.style.width = larguraCss + 'px';
    zoomEl.style.height = boxH + 'px';
    zoomEl.style.left = '0px';
    zoomEl.style.top = (alturaCss - boxH - 12) + 'px';
  }

  function toggleZoom(wrapRoot, btn) {
    zoomAtivo = !zoomAtivo;
    btn.classList.toggle('active', zoomAtivo);
    if (!zoomAtivo) {
      if (zoomEl) zoomEl.hidden = true;
      return;
    }
    if (!zoomEl) {
      zoomEl = document.createElement('div');
      zoomEl.className = 'hw-zoom';
      zoomEl.innerHTML = `
        <div class="hw-zoom-header">🔍 Caixa de zoom<span class="hw-zoom-close">✕</span></div>
        <canvas class="hw-zoom-canvas"></canvas>
      `;
      wrapRoot.appendChild(zoomEl);
      zoomCanvas = zoomEl.querySelector('.hw-zoom-canvas');
      const header = zoomEl.querySelector('.hw-zoom-header');
      zoomEl.querySelector('.hw-zoom-close').addEventListener('click', () => toggleZoom(wrapRoot, btn));

      header.addEventListener('pointerdown', (e) => {
        // Capturar o ponteiro aqui pro arraste rouba o "click" de qualquer
        // filho (o "✕", por exemplo) — o clique acaba disparando no header
        // em vez de no botão. Por isso, tocar no "✕" não inicia arraste.
        if (e.target.closest('.hw-zoom-close')) return;
        header.setPointerCapture(e.pointerId);
        const r = zoomEl.getBoundingClientRect();
        const wr = wrapRoot.getBoundingClientRect();
        arrastandoZoom = { dx: e.clientX - r.left, dy: e.clientY - r.top, wr };
      });
      header.addEventListener('pointermove', (e) => {
        if (!arrastandoZoom) return;
        const wr = arrastandoZoom.wr;
        let left = e.clientX - wr.left - arrastandoZoom.dx;
        let top = e.clientY - wr.top - arrastandoZoom.dy;
        left = Math.max(0, Math.min(left, larguraCss - zoomEl.clientWidth));
        top = Math.max(0, Math.min(top, alturaCss - zoomEl.clientHeight));
        zoomEl.style.left = left + 'px';
        zoomEl.style.top = top + 'px';

        // Arrastar a caixa não move só ela na tela — como uma lupa de
        // verdade, o trecho espelhado passa a acompanhar, mostrando o que
        // está na folha embaixo da posição nova (não mais o que o avanço
        // automático tinha deixado ali antes).
        sourceRect.x = MARGEM;
        sourceRect.y = Math.max(MARGEM, Math.min(alturaCss - sourceRect.h - MARGEM, top));
        atualizarEspelhoZoom();
      });
      header.addEventListener('pointerup', () => { arrastandoZoom = null; });
      header.addEventListener('pointercancel', () => { arrastandoZoom = null; });

      zoomCanvas.addEventListener('pointerdown', onZoomPointerDown);
      zoomCanvas.addEventListener('pointermove', onZoomPointerMove);
      zoomCanvas.addEventListener('pointerup', onZoomPointerUp);
      zoomCanvas.addEventListener('pointercancel', onZoomPointerUp);
      zoomCanvas.addEventListener('pointerleave', onZoomPointerUp);
      zoomCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

      posicionarZoomPadrao();
    }
    zoomEl.hidden = false;
    const cfg = configurarCanvas(zoomCanvas);
    zoomCtx = cfg.ctx;
    zoomDpr = cfg.dpr;
    if (!sourceRectPronto) {
      // y inicial bate com a posição em que a caixa já foi colocada na tela
      // (perto do fim, ergonomicamente) — sem isso, ela nasce mostrando o
      // topo da folha enquanto fica desenhada perto do fim da tela.
      const topInicial = parseFloat(zoomEl.style.top) || MARGEM;
      sourceRect = { x: MARGEM, y: topInicial, w: cfg.w / ZOOM_FATOR, h: cfg.h / ZOOM_FATOR };
      sourceRectPronto = true;
    }
    atualizarEspelhoZoom();
  }

  // ---- montagem da UI ----

  // `tracosIniciais`, se vier, é o histórico de traços de uma anotação já
  // salva antes — pré-carrega o canvas com ele (cópia, não a referência
  // original) pra reabrir e continuar editando de verdade: desfazer, apagar
  // o que já tinha sido escrito, tudo funciona igual a uma anotação nova.
  function abrir({ onSave, tracosIniciais }) {
    onSaveCb = onSave;
    strokes = tracosIniciais ? JSON.parse(JSON.stringify(tracosIniciais)) : [];
    redoStack = [];
    zoomAtivo = false;
    ferramentaAtual = 'lapis';

    overlay = document.createElement('div');
    overlay.className = 'hw-overlay';
    overlay.innerHTML = `
      <div class="hw-toolbar">
        <div class="tabs hw-toolbar-group" style="margin:0">
          <button class="hw-tool active" data-tool="lapis" title="Lápis">✏️</button>
          <button class="hw-tool" data-tool="caneta" title="Caneta">🖋️</button>
          <button class="hw-tool" data-tool="marcador" title="Marca-texto">🖊️</button>
          <button class="hw-tool" data-tool="borracha" title="Borracha">🧽</button>
        </div>
        <div class="hw-toolbar-group">
          ${CORES.map((c) => `<button class="hw-swatch" data-cor="${c}" style="background:${c}"></button>`).join('')}
          <input type="range" class="hw-espessura" min="2" max="14" value="${tamanhoAtual}">
        </div>
        <div class="hw-toolbar-group">
          <button class="btn btn-ghost hw-undo" type="button">Desfazer</button>
          <button class="btn btn-ghost hw-redo" type="button">Refazer</button>
          <button class="btn btn-ghost hw-clear" type="button">Limpar</button>
        </div>
        <div class="hw-toolbar-group" style="margin-left:auto">
          <button class="btn btn-ghost hw-zoom-toggle" type="button">🔍 Zoom</button>
        </div>
      </div>
      <div class="hw-canvas-wrap"><canvas class="hw-canvas"></canvas></div>
      <div class="hw-actions">
        <button class="btn btn-ghost hw-cancel" type="button">Cancelar</button>
        <button class="btn btn-primary hw-save" type="button">Salvar</button>
      </div>
    `;
    document.body.appendChild(overlay);
    // Reforço em JS além do CSS: em alguns casos o WebKit ainda tenta iniciar
    // seleção/arraste de conteúdo num traço longo e contínuo da Pencil —
    // isso interrompe a escrita no meio (o traço "para" e abre menu de
    // seleção). Bloquear os eventos que iniciam isso resolve de vez.
    overlay.addEventListener('selectstart', (e) => e.preventDefault());
    overlay.addEventListener('dragstart', (e) => e.preventDefault());
    // A rejeição de palma no canvas não bastava: uma palma apoiada perto da
    // barra de ferramentas (cores, ferramentas, zoom) ainda tocava os
    // botões normalmente, porque eles só ouviam "click" (que não distingue
    // dedo de Pencil). Bloqueando aqui, em cima de tudo e na fase de
    // captura, nenhum toque (só Pencil ou mouse) interage com a ferramenta
    // inteira — não só com o desenho.
    overlay.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { e.preventDefault(); e.stopPropagation(); }
    }, true);

    canvas = overlay.querySelector('.hw-canvas');
    canvasWrap = overlay.querySelector('.hw-canvas-wrap');
    // Pauta via CSS (não faz parte do bitmap — ver desenharFundo).
    canvas.style.backgroundImage = `repeating-linear-gradient(to bottom, transparent 0, transparent ${ESPACO_LINHA - 1}px, ${COR_PAUTA} ${ESPACO_LINHA - 1}px, ${COR_PAUTA} ${ESPACO_LINHA}px)`;
    const rect = canvas.getBoundingClientRect();
    larguraCss = rect.width;
    alturaCss = rect.height;
    const cfg = configurarCanvas(canvas);
    ctx = cfg.ctx;
    dpr = cfg.dpr;
    redesenharTudo(); // limpa e replay dos tracosIniciais (se houver — senão é só limpar)

    overlay.querySelectorAll('.hw-tool').forEach((btn) => {
      btn.addEventListener('click', () => {
        ferramentaAtual = btn.dataset.tool;
        overlay.querySelectorAll('.hw-tool').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    overlay.querySelectorAll('.hw-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        corAtual = btn.dataset.cor;
        overlay.querySelectorAll('.hw-swatch').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    overlay.querySelector('.hw-swatch').classList.add('active');

    overlay.querySelector('.hw-espessura').addEventListener('input', (e) => {
      tamanhoAtual = Number(e.target.value);
    });
    overlay.querySelector('.hw-undo').addEventListener('click', undo);
    overlay.querySelector('.hw-redo').addEventListener('click', redo);
    overlay.querySelector('.hw-clear').addEventListener('click', limpar);
    overlay.querySelector('.hw-cancel').addEventListener('click', fechar);
    overlay.querySelector('.hw-save').addEventListener('click', salvar);
    overlay.querySelector('.hw-zoom-toggle').addEventListener('click', (e) => toggleZoom(canvasWrap, e.currentTarget));

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    // Guarda extra contra o Safari abrir menu de seleção/callout no meio de
    // um traço longo com a Pencil.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  return { abrir };
})();
