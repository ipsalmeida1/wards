// App principal: roteamento por hash + render via innerHTML. Sem framework —
// app pequeno, uso pessoal, prioridade é funcionar 100% offline sem build.

const { Store: DB, uuid: newId } = window.WardsDB;
const $app = () => document.getElementById('app');

function hojeLocalISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function dataLocalDeInput(valorYYYYMMDD) {
  const [ano, mes, dia] = valorYYYYMMDD.split('-').map(Number);
  return new Date(ano, mes - 1, dia).getTime();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
// Pra texto livre exibido (não pra dentro de textarea, que é sempre plano):
// escapa primeiro (segurança), só depois procura ==destaque== — assim o
// conteúdo marcado nunca escapa da tag <mark>. Convenção: digite ==trecho==
// ao redor do que quiser destacar; funciona nas evoluções, pareceres,
// planos, exames e observações de prescrição.
function renderTexto(s) {
  return esc(s).replace(/==([^=\n]+)==/g, '<mark>$1</mark>').replace(/\n/g, '<br>');
}
function fmtData(ts, comHora) {
  if (!ts) return '—';
  const d = new Date(ts);
  const data = d.toLocaleDateString('pt-BR');
  return comHora ? `${data} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : data;
}

function render(html) { $app().innerHTML = html; }
function nav(hash) { location.hash = hash; }

// ---------- boot / sessão ----------

let sessaoAtual = null;
SB.auth.onAuthStateChange((_evento, session) => { sessaoAtual = session; });

async function boot() {
  const { data } = await SB.auth.getSession();
  sessaoAtual = data.session;
  if (!sessaoAtual) return viewLogin();
  await Archive.executarSeNecessario();
  renderRoute();
}

window.addEventListener('hashchange', renderRoute);

function renderRoute() {
  if (!sessaoAtual) return viewLogin();

  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'paciente' && parts[1]) {
    return viewPatientDetail(parts[1], parts[2] || 'hda');
  }
  if (parts[0] === 'novo-paciente') return viewNewPatient();
  if (parts[0] === 'exame' && parts[1]) return viewNewExam(parts[1], parts[2] || 'lab');
  if (parts[0] === 'tendencia' && parts[1]) return viewTrend(parts[1]);
  if (parts[0] === 'exame-ver' && parts[1]) return viewExamDetail(parts[1]);
  if (parts[0] === 'relatorio') return viewReport();
  if (parts[0] === 'arquivo') return viewArchiveList();
  return viewPatientList();
}

// Sem card/shell — tela isolada, antes de qualquer coisa do app aparecer.
let modoCadastroLogin = false;

function viewLogin() {
  render(`
    <div style="max-width:380px;margin:15vh auto 0;padding:0 20px">
      <h1 style="text-align:center;margin-bottom:24px;font-size:26px">Wards</h1>
      <div class="card">
        <label>E-mail</label>
        <input id="login-email" type="email" autocomplete="email" inputmode="email">
        <label>Senha</label>
        <input id="login-senha" type="password" autocomplete="${modoCadastroLogin ? 'new-password' : 'current-password'}">
        <button class="btn btn-primary" onclick="onEntrarOuCadastrar()">${modoCadastroLogin ? 'Criar conta' : 'Entrar'}</button>
        <button class="btn btn-ghost" onclick="onAlternarModoLogin()">${modoCadastroLogin ? 'Já tenho conta' : 'Criar conta nova'}</button>
        <div id="login-msg" class="sub" style="margin-top:8px"></div>
      </div>
    </div>
  `);
  document.getElementById('login-senha').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onEntrarOuCadastrar();
  });
}

function onAlternarModoLogin() {
  modoCadastroLogin = !modoCadastroLogin;
  viewLogin();
}

async function onEntrarOuCadastrar() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const msgEl = document.getElementById('login-msg');
  msgEl.style.color = 'var(--danger)';
  msgEl.textContent = '';
  if (!email || !senha) { msgEl.textContent = 'Preencha e-mail e senha.'; return; }

  if (modoCadastroLogin) {
    const { data, error } = await SB.auth.signUp({ email, password: senha });
    if (error) { msgEl.textContent = error.message; return; }
    if (!data.session) {
      msgEl.style.color = 'var(--ink-mute)';
      msgEl.textContent = 'Conta criada — confirma pelo link que chegou no seu e-mail antes de entrar.';
      return;
    }
    sessaoAtual = data.session;
  } else {
    const { data, error } = await SB.auth.signInWithPassword({ email, password: senha });
    if (error) { msgEl.textContent = 'E-mail ou senha incorretos.'; return; }
    sessaoAtual = data.session;
  }
  await Archive.executarSeNecessario();
  renderRoute();
}

async function onSair() {
  await SB.auth.signOut();
  sessaoAtual = null;
  viewLogin();
}

// ---------- data helpers ----------

// Anexos (fotos, laudos, anotações à mão) não guardam mais o arquivo dentro
// do próprio registro — um Blob não sobrevive a virar JSON pra mandar pro
// Postgres. O arquivo de verdade sobe pro bucket privado "anexos" (Supabase
// Storage), sob `<user_id>/<attachment_id>`; o registro guarda só esse
// caminho em `storagePath`. Como o bucket é privado, exibir a imagem exige
// uma URL assinada (expira, mas 1h é de sobra pra abrir a tela e olhar).
async function subirAnexo(attachmentId, blob) {
  const path = `${sessaoAtual.user.id}/${attachmentId}`;
  const { error } = await SB.storage.from('anexos').upload(path, blob, {
    upsert: true, contentType: blob.type || 'application/octet-stream',
  });
  if (error) throw error;
  return path;
}
async function urlAssinada(storagePath) {
  if (!storagePath) return '';
  const { data, error } = await SB.storage.from('anexos').createSignedUrl(storagePath, 3600);
  return error ? '' : data.signedUrl;
}
async function comUrlsAssinadas(anexos) {
  return Promise.all(anexos.map(async (a) => ({ ...a, url: await urlAssinada(a.storagePath) })));
}

async function getAdmission(id) { return DB.get('admissions', id); }
async function getPatient(id) { return DB.get('patients', id); }

// Iniciais são sempre derivadas do nome completo, nunca digitadas à mão —
// evita gente escrevendo "J.S." de um jeito num paciente e "JS" noutro.
// Conectores comuns ficam de fora ("Maria de Souza Costa" -> "M.S.C.").
function extrairIniciais(nomeCompleto) {
  const conectores = new Set(['de', 'da', 'do', 'dos', 'das', 'e']);
  const letras = nomeCompleto
    .trim()
    .split(/\s+/)
    .filter((p) => p && !conectores.has(p.toLowerCase()))
    .map((p) => p[0].toUpperCase());
  return letras.length ? letras.join('.') + '.' : '';
}

async function criarPacienteEAdmissao(fields) {
  const patient = {
    id: newId(),
    nomeCompleto: fields.nomeCompleto,
    iniciais: extrairIniciais(fields.nomeCompleto),
    idade: fields.idade ? Number(fields.idade) : null,
    dataNasc: null, sexo: '',
  };
  await DB.put('patients', patient);
  const admission = {
    id: newId(), patientId: patient.id, leito: fields.leito,
    dataAdmissao: Date.now(), motivoAdmissao: fields.motivo || '', hda: fields.hda || '',
    status: 'ativo',
  };
  await DB.put('admissions', admission);
  return admission;
}

async function addProblema(admissionId, texto) {
  const cat = await Matching.resolverCategoria(texto);
  await DB.put('problemas', {
    id: newId(), admissionId, textoDigitado: texto, diagnosisCategoryId: cat.id,
    criadoEm: Date.now(), ativo: true,
  });
}

async function addComorbidade(patientId, texto, categoria = 'comorbidade') {
  await DB.put('comorbidades', { id: newId(), patientId, texto, categoria, criadoEm: Date.now(), ativa: true });
}

async function addOpiniao(admissionId, fields) {
  await DB.put('opinions', {
    id: newId(), admissionId, especialidade: fields.especialidade, autor: fields.autor,
    texto: fields.texto, dataHora: Date.now(),
  });
}

async function addPlano(admissionId, descricao, categoria = 'residente') {
  await DB.put('planItems', { id: newId(), admissionId, descricao, categoria, concluido: false, criadoEm: Date.now() });
}

// ---------- shell ----------

function shell({ title, back, right, body, fabHtml }) {
  render(`
    <header class="topbar">
      ${back ? `<button class="back" onclick="nav('${back}')">‹ Voltar</button>` : '<span></span>'}
      <h1>${esc(title)}</h1>
      <span>${right || ''}</span>
    </header>
    <main>${body}</main>
    ${fabHtml ? `<div class="fab">${fabHtml}</div>` : ''}
  `);
}

// ---------- lista de pacientes ----------

async function viewPatientList(busca = '') {
  const todas = await DB.where('admissions', (a) => a.status === 'ativo');
  const patients = Object.fromEntries((await DB.all('patients')).map((p) => [p.id, p]));

  const filtradas = todas.filter((a) => {
    if (!busca) return true;
    const alvo = busca.toLowerCase();
    const p = patients[a.patientId] || {};
    return (a.leito || '').toLowerCase().includes(alvo)
      || (p.iniciais || '').toLowerCase().includes(alvo)
      || (a.motivoAdmissao || '').toLowerCase().includes(alvo);
  }).sort((a, b) => (a.leito || '').localeCompare(b.leito || ''));

  const itens = filtradas.map((a) => {
    const p = patients[a.patientId] || {};
    return `
      <div class="swipe-item">
        <div class="swipe-action" onclick="onExcluirAdmissao('${a.id}')">🗑️<br>Excluir</div>
        <div class="card tappable swipe-content" onclick="onCliqueCardPaciente(this, '${a.id}')">
          <div class="row">
            <span class="leito">${esc(a.leito)}</span>
            <button class="icon-btn" style="width:auto;font-size:19px" onclick="event.stopPropagation(); onDarAltaDireto('${a.id}')" title="Dar alta" aria-label="Dar alta">🏠</button>
          </div>
          <div class="sub">${esc(p.nomeCompleto || p.iniciais || 'sem paciente')} — admitido em ${fmtData(a.dataAdmissao)}</div>
          ${a.motivoAdmissao ? `<div class="sub">${esc(a.motivoAdmissao)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  shell({
    title: 'Pacientes do dia',
    right: `<button class="icon-btn" onclick="nav('arquivo')">🗄️</button><button class="icon-btn" onclick="nav('relatorio')">📊</button><button class="icon-btn" onclick="onSair()" title="Sair" aria-label="Sair">⏻</button>`,
    body: `
      <input class="searchbar" placeholder="Leito, iniciais ou motivo" value="${esc(busca)}"
        oninput="viewPatientList(this.value)">
      ${itens || '<div class="empty">Nenhum paciente ativo.<br>Toque em "+ Novo paciente" pra começar.</div>'}
    `,
    fabHtml: `<button class="btn btn-primary" onclick="nav('novo-paciente')">+ Novo paciente</button>`,
  });

  // O render acima troca o <input> por um elemento novo, então ele perde o
  // foco a cada letra digitada (fica "sumindo" — na real é o cursor que
  // sai). Restaura o foco e a posição do cursor no elemento novo.
  if (busca) {
    const inputEl = document.querySelector('.searchbar');
    if (inputEl) {
      inputEl.focus();
      inputEl.setSelectionRange(busca.length, busca.length);
    }
  }

  document.querySelectorAll('.swipe-content').forEach(ligarSwipe);
}

// ---------- deslizar pra excluir (lista de pacientes) ----------

const SWIPE_LARGURA_ACAO = 84;
let swipeAberto = null; // elemento .swipe-content atualmente revelado, se algum

function fecharSwipeAberto() {
  if (swipeAberto) {
    swipeAberto.style.transition = 'transform 0.18s ease-out';
    swipeAberto.style.transform = 'translateX(0)';
    swipeAberto = null;
  }
}

function ligarSwipe(el) {
  let inicioX = 0, inicioY = 0, deltaAtual = 0, arrastando = false, decidido = false, ehHorizontal = false;

  el.addEventListener('pointerdown', (e) => {
    if (swipeAberto && swipeAberto !== el) fecharSwipeAberto();
    inicioX = e.clientX; inicioY = e.clientY; arrastando = true; decidido = false;
    el.style.transition = 'none';
  });

  el.addEventListener('pointermove', (e) => {
    if (!arrastando) return;
    const dx = e.clientX - inicioX;
    const dy = e.clientY - inicioY;
    if (!decidido) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return; // ainda não deu pra saber se é swipe ou scroll
      decidido = true;
      ehHorizontal = Math.abs(dx) > Math.abs(dy);
      if (!ehHorizontal) { arrastando = false; return; } // deixa o scroll vertical normal acontecer
      el.setPointerCapture(e.pointerId);
    }
    if (!ehHorizontal) return;
    e.preventDefault();
    const partidaDe = el === swipeAberto ? -SWIPE_LARGURA_ACAO : 0;
    deltaAtual = Math.max(-SWIPE_LARGURA_ACAO, Math.min(0, partidaDe + dx));
    el.style.transform = `translateX(${deltaAtual}px)`;
  });

  function soltar() {
    if (!arrastando) return;
    arrastando = false;
    if (!ehHorizontal) return;
    el.style.transition = 'transform 0.18s ease-out';
    if (deltaAtual < -SWIPE_LARGURA_ACAO / 2) {
      el.style.transform = `translateX(-${SWIPE_LARGURA_ACAO}px)`;
      swipeAberto = el;
    } else {
      el.style.transform = 'translateX(0)';
      if (swipeAberto === el) swipeAberto = null;
    }
  }
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
}

// Tocar no card: se estiver revelado (aberto pelo swipe), só fecha; senão,
// abre o paciente normalmente. Sem isso, tocar num card aberto pra fechá-lo
// acabaria também navegando, o que não é o esperado.
function onCliqueCardPaciente(el, admissionId) {
  if (swipeAberto === el) {
    fecharSwipeAberto();
    return;
  }
  nav(`paciente/${admissionId}`);
}

// "Excluir" aqui é de vez — apaga a admissão e tudo ligado a ela (problemas,
// evoluções, sinais vitais, exames, pareceres, planos, anexos). Sem
// confirmação isso seria perigoso demais pra dado clínico real, por isso o
// confirm() antes de qualquer coisa.
async function onExcluirAdmissao(admissionId) {
  fecharSwipeAberto();
  const ok = await Dialog.confirmar({
    titulo: 'Apagar internação de vez?',
    mensagem: 'HDA, evoluções, sinais vitais, exames, pareceres, planos e anotações dela serão perdidos para sempre — sem volta.',
    textoConfirmar: 'Apagar de vez',
    perigoso: true,
  });
  if (!ok) return;
  excluirAdmissaoDeVez(admissionId);
}

async function excluirAdmissaoDeVez(admissionId) {
  const admission = await DB.get('admissions', admissionId);
  if (!admission) return;

  const roundEntries = await DB.where('roundEntries', (r) => r.admissionId === admissionId);
  const exames = await DB.where('exams', (e) => e.admissionId === admissionId);
  const exameIds = new Set(exames.map((e) => e.id));
  const roundEntryIds = new Set(roundEntries.map((r) => r.id));
  const anexos = await DB.where('attachments', (a) =>
    a.admissionId === admissionId || exameIds.has(a.examId) || roundEntryIds.has(a.roundEntryId)
  );
  const problemas = await DB.where('problemas', (p) => p.admissionId === admissionId);
  const opinions = await DB.where('opinions', (o) => o.admissionId === admissionId);
  const planItems = await DB.where('planItems', (p) => p.admissionId === admissionId);
  const vitalSigns = await DB.where('vitalSigns', (v) => v.admissionId === admissionId);

  for (const r of roundEntries) await DB.remove('roundEntries', r.id);
  for (const e of exames) await DB.remove('exams', e.id);
  for (const a of anexos) await DB.remove('attachments', a.id);
  for (const p of problemas) await DB.remove('problemas', p.id);
  for (const o of opinions) await DB.remove('opinions', o.id);
  for (const p of planItems) await DB.remove('planItems', p.id);
  for (const v of vitalSigns) await DB.remove('vitalSigns', v.id);

  const patientId = admission.patientId;
  await DB.remove('admissions', admissionId);

  const outrasAdmissoes = await DB.where('admissions', (a) => a.patientId === patientId && a.id !== admissionId);
  if (!outrasAdmissoes.length) {
    await DB.remove('patients', patientId);
    const comorbidades = await DB.where('comorbidades', (c) => c.patientId === patientId);
    for (const c of comorbidades) await DB.remove('comorbidades', c.id);
  }

  viewPatientList();
}

// ---------- novo paciente ----------

function viewNewPatient() {
  shell({
    title: 'Novo paciente', back: '/',
    body: `
      <label>Leito</label><input id="f-leito" type="text" placeholder="Ex.: 302-B">
      <label>Nome completo do paciente</label><input id="f-nome" type="text" placeholder="Ex.: Maria da Silva Santos">
      <label>Idade</label><input id="f-idade" type="number" placeholder="Ex.: 34">
      <label>Motivo da admissão</label><input id="f-motivo" type="text">
      <label>HDA</label><textarea id="f-hda"></textarea>
      <button class="btn btn-primary" onclick="salvarNovoPaciente()">Salvar</button>
    `,
  });
}

async function salvarNovoPaciente() {
  const leito = document.getElementById('f-leito').value.trim();
  const nomeCompleto = document.getElementById('f-nome').value.trim();
  if (!leito || !nomeCompleto) { Dialog.avisar('Preencha pelo menos leito e nome completo.', { tipo: 'erro' }); return; }
  const admission = await criarPacienteEAdmissao({
    leito, nomeCompleto,
    idade: document.getElementById('f-idade').value.trim(),
    motivo: document.getElementById('f-motivo').value.trim(),
    hda: document.getElementById('f-hda').value.trim(),
  });
  nav(`paciente/${admission.id}`);
}

// ---------- ficha do paciente ----------

const TABS = ['hda', 'comorbidades', 'vitais', 'evolucoes', 'exames', 'planos', 'prescricoes', 'pareceres'];
const TAB_LABEL = {
  hda: 'HDA', comorbidades: 'A.P', vitais: 'Sinais Vitais', exames: 'Exames',
  pareceres: 'Pareceres', planos: 'Planos', evolucoes: 'Bloco de Notas',
  prescricoes: 'Prescrições',
};

async function viewPatientDetail(admissionId, tab) {
  const admission = await getAdmission(admissionId);
  if (!admission) return viewPatientList();
  const patient = await getPatient(admission.patientId);

  const tabsHtml = TABS.map((t) =>
    `<button class="${t === tab ? 'active' : ''}" onclick="nav('paciente/${admissionId}/${t}')">${TAB_LABEL[t]}</button>`
  ).join('');

  vitaisChartPontos = null;
  let body = '';
  if (tab === 'hda') body = await tabHDA(admission);
  else if (tab === 'comorbidades') body = await tabComorbidades(patient);
  else if (tab === 'vitais') body = await tabVitais(admission);
  else if (tab === 'exames') body = await tabExames(admission);
  else if (tab === 'pareceres') body = await tabPareceres(admission);
  else if (tab === 'planos') body = await tabPlanos(admission);
  else if (tab === 'prescricoes') body = await tabPrescricoes(admission);
  else body = await tabEvolucoes(admission);

  // O FAB só existe na aba Exames — nas outras, cada uma já tem seu próprio
  // botão de ação no lugar certo (Adicionar, Adicionar parecer...), e um FAB
  // fixo por cima de todas as abas só criava um alvo de toque errado bem em
  // cima de onde a ação de cada aba normalmente fica. Bloco de Notas não tem
  // botão próprio nenhum — grava sozinho (ver onDigitarNotepad).
  shell({
    title: `${admission.leito} — ${patient?.nomeCompleto || patient?.iniciais || ''}`,
    back: '/',
    right: `<button class="icon-btn no-print" onclick="window.print()">🖨️</button>`,
    body: `<div class="tabs">${tabsHtml}</div>${body}`,
    fabHtml: tab === 'exames'
      ? `<button class="btn btn-primary" style="width:100%" onclick="nav('exame/${admissionId}')">+ Exame</button>`
      : '',
  });

  if (tab === 'vitais' && vitaisChartPontos) desenharTendencia('vitais-canvas', vitaisChartPontos);
  if (tab === 'evolucoes') autoResizeTextarea(document.getElementById('edit-evolucao'));
}

const STATUS_LABEL = { ativo: 'Ativo', alta: 'Alta', obito: 'Óbito', arquivado: 'Arquivado' };

// "Dar alta" agora se faz direto na lista de pacientes (ícone 🏠 no card) —
// aqui só sobra o status em si e, se já não estiver ativo, o "Reabrir" pra
// desfazer (essa ação continua só alcançável por aqui mesmo).
function statusCard(admission) {
  const acoes = admission.status === 'ativo'
    ? ''
    : `<button class="btn btn-secondary" style="margin-top:0" onclick="mudarStatus('${admission.id}','ativo')">Reabrir (voltar a ativo)</button>`;
  return `
    <div class="card row">
      <span>Status: <strong>${STATUS_LABEL[admission.status] || admission.status}</strong></span>
    </div>
    ${acoes ? `<div style="margin-bottom:10px">${acoes}</div>` : ''}
  `;
}
async function mudarStatus(admissionId, novoStatus) {
  const a = await getAdmission(admissionId);
  a.status = novoStatus;
  await DB.put('admissions', a);
  viewPatientDetail(admissionId, 'hda');
}

// Perguntar a HD final na alta é o que alimenta a contagem por diagnóstico
// no relatório mensal — sem essa pergunta não tem como saber depois qual
// foi o diagnóstico principal de quem já saiu. Cancelar o prompt cancela a
// alta também (o paciente continua ativo), pra não deixar isso de lado sem
// querer; deixar em branco e confirmar dá alta mesmo assim, só sem contar
// pra nenhuma categoria específica.
async function onDarAltaDireto(admissionId) {
  const a = await getAdmission(admissionId);
  if (!a) return;
  const hd = await Dialog.perguntar({
    titulo: 'Dar alta',
    mensagem: 'Qual foi a hipótese diagnóstica (HD) final desta internação?',
    valorInicial: a.hdFinal || '',
    placeholder: 'Ex.: Pneumonia adquirida na comunidade',
    textoConfirmar: 'Dar alta',
  });
  if (hd === null) return;

  a.status = 'alta';
  a.dataAlta = Date.now();
  a.hdFinal = hd.trim();
  a.hdFinalCategoryId = a.hdFinal ? (await Matching.resolverCategoria(a.hdFinal)).id : null;
  await DB.put('admissions', a);
  viewPatientList();
}

// Resumo por data da HDA — mecânico, sem IA: acha marcas "dia DD/MM" no
// texto (convenção de quem escreve a HDA cronologicamente, ex.: "dia
// 25/08: dor no corpo e febre, dia 27/08 rash cutâneo") e usa o trecho
// entre uma marca e a próxima como aquele dia. Corta na primeira frase
// (até ./!/quebra de linha) só por estrutura — não julga o que é
// "importante", só evita uma linha do resumo virar o parágrafo inteiro.
function extrairResumoPorData(texto) {
  const reData = /dia\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*:?\s*/gi;
  const marcas = [...(texto || '').matchAll(reData)];
  if (!marcas.length) return [];
  return marcas.map((m, i) => {
    const inicio = m.index + m[0].length;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    let trecho = texto.slice(inicio, fim).trim();
    const primeiraFrase = trecho.match(/^[^.!?\n]+[.!?]?/);
    if (primeiraFrase) trecho = primeiraFrase[0].trim();
    trecho = trecho.replace(/[,;]+$/, '').trim();
    return { data: m[1], texto: trecho };
  }).filter((l) => l.texto);
}

// Atualiza a faixa de resumo ao vivo, a cada tecla. Só mexe no DOM (cria/
// atualiza/remove a faixa) — quem grava de verdade no banco é o
// salvarHDADebounced, chamado à parte no mesmo oninput.
function onDigitarHDA(campo) {
  const wrap = campo.closest('.hda-com-resumo');
  const linhas = extrairResumoPorData(campo.value);
  let faixa = wrap.querySelector('.hda-resumo-fixo');
  if (!linhas.length) {
    if (faixa) faixa.remove();
    return;
  }
  if (!faixa) {
    faixa = document.createElement('div');
    faixa.className = 'hda-resumo-fixo';
    wrap.insertBefore(faixa, campo);
  }
  faixa.innerHTML = linhas.map((l) => `<strong>${esc(l.data)}:</strong> ${renderTexto(l.texto)}`).join('<br>');
}

async function tabHDA(admission) {
  // Ordem de prioridade, não de criação: problema sem `ordem` (registro
  // antigo, ou recém-adicionado) cai pro fim da lista pela data de criação —
  // só ganha uma posição fixa quando alguém de fato move ele pra cima/baixo.
  const problemas = (await DB.where('problemas', (p) => p.admissionId === admission.id))
    .sort((a, b) => (a.ordem ?? a.criadoEm) - (b.ordem ?? b.criadoEm));
  const anexos = (await DB.where('attachments', (a) => a.admissionId === admission.id && a.secao === 'hda'))
    .sort((a, b) => b.criadoEm - a.criadoEm);
  const resumoPorData = extrairResumoPorData(admission.hda);

  const thumbs = (await comUrlsAssinadas(anexos)).map((a) => {
    return `
      <div class="card" style="padding:8px">
        <a href="${a.url}" target="_blank" rel="noopener">
          <img src="${a.url}" alt="Anotação da HDA" style="width:100%;border-radius:8px;display:block">
        </a>
        <div class="row" style="margin-top:6px">
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','hda'); })">✏️ Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoHDA('${a.id}','${admission.id}')" aria-label="Remover" title="Remover">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${statusCard(admission)}
    <label>Motivo da admissão</label>
    <input id="edit-motivo" type="text" value="${esc(admission.motivoAdmissao || '')}" oninput="salvarHDADebounced('${admission.id}')">
    <label>HDA</label>
    <div class="hda-com-resumo">
      ${resumoPorData.length ? `
        <div class="hda-resumo-fixo">
          ${resumoPorData.map((l) => `<strong>${esc(l.data)}:</strong> ${renderTexto(l.texto)}`).join('<br>')}
        </div>
      ` : ''}
      <textarea id="edit-hda" oninput="onDigitarHDA(this); salvarHDADebounced('${admission.id}')" placeholder="Envolva um trecho com ==assim== pra destacar. Escrever cronologicamente? Use &quot;dia 25/08: ...&quot; pra ganhar um resumo por data fixo no topo." style="min-height:260px">${esc(admission.hda || '')}</textarea>
    </div>
    <div id="hda-status" class="sub" style="text-align:right;margin-top:4px">${(admission.motivoAdmissao || admission.hda) ? 'Salvo' : ''}</div>

    <div class="section-title">Anotações à mão</div>
    ${thumbs ? `<div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:10px">${thumbs}</div>` : ''}
    <button class="btn btn-secondary" onclick="onEscreverAmaoHDA('${admission.id}')">✍️ Escrever com a Pencil</button>

    <div class="section-title">Lista de problemas</div>
    <div class="card">
      ${problemas.map((p, i) => `
        <div class="list-item row">
          <span>${esc(p.textoDigitado)}</span>
          <div class="row" style="gap:0;flex:none">
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" ${i === 0 ? 'disabled' : ''} onclick="onMoverProblema('${p.id}','${admission.id}',-1)" aria-label="Mais prioritário" title="Mais prioritário">▲</button>
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" ${i === problemas.length - 1 ? 'disabled' : ''} onclick="onMoverProblema('${p.id}','${admission.id}',1)" aria-label="Menos prioritário" title="Menos prioritário">▼</button>
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" onclick="onRemoverProblema('${p.id}','${admission.id}')" aria-label="Remover problema" title="Remover">🗑️</button>
          </div>
        </div>
      `).join('') || '<div class="list-item">Nenhum problema ainda.</div>'}
      <div class="grid2" style="margin-top:10px">
        <input id="novo-problema" type="text" placeholder="Adicionar problema">
        <button class="btn btn-secondary" style="margin-top:0" onclick="onAddProblema('${admission.id}')">Adicionar</button>
      </div>
    </div>
  `;
}
async function onAddProblema(admissionId) {
  const el = document.getElementById('novo-problema');
  const texto = el.value.trim();
  if (!texto) return;
  await addProblema(admissionId, texto);
  viewPatientDetail(admissionId, 'hda');
}

async function onRemoverProblema(problemaId, admissionId) {
  await DB.remove('problemas', problemaId);
  viewPatientDetail(admissionId, 'hda');
}

// Troca de posição na lista (não só troca de `ordem` entre os dois): assim
// que alguém move qualquer problema uma vez, a lista inteira ganha uma
// sequência de `ordem` própria (0, 1, 2...) — antes disso ela só existia
// implicitamente pela data de criação, que não é o que se quer priorizar.
async function onMoverProblema(problemaId, admissionId, direcao) {
  const problemas = (await DB.where('problemas', (p) => p.admissionId === admissionId))
    .sort((a, b) => (a.ordem ?? a.criadoEm) - (b.ordem ?? b.criadoEm));
  const i = problemas.findIndex((p) => p.id === problemaId);
  const j = i + direcao;
  if (i === -1 || j < 0 || j >= problemas.length) return;
  [problemas[i], problemas[j]] = [problemas[j], problemas[i]];
  await Promise.all(problemas.map((p, novaOrdem) => DB.put('problemas', { ...p, ordem: novaOrdem })));
  viewPatientDetail(admissionId, 'hda');
}

// Sem botão "Salvar": motivo + HDA gravam sozinhos 600ms depois de parar de
// digitar (mesmo esquema do Bloco de Notas, ver onDigitarNotepad).
let debounceSalvarHDA = null;
function salvarHDADebounced(admissionId) {
  const statusEl = document.getElementById('hda-status');
  if (statusEl) statusEl.textContent = 'Salvando…';
  clearTimeout(debounceSalvarHDA);
  debounceSalvarHDA = setTimeout(async () => {
    const admission = await getAdmission(admissionId);
    admission.motivoAdmissao = document.getElementById('edit-motivo').value.trim();
    admission.hda = document.getElementById('edit-hda').value.trim();
    await DB.put('admissions', admission);
    const statusAtual = document.getElementById('hda-status');
    if (statusAtual) statusAtual.textContent = `Salvo às ${fmtData(Date.now(), true).split(' ')[1]}`;
  }, 600);
}

function onEscreverAmaoHDA(admissionId) {
  const campo = document.getElementById('edit-hda');
  Scribble.abrir({
    titulo: 'HDA',
    valorInicial: campo.value,
    onSalvar: (texto) => { campo.value = texto; onDigitarHDA(campo); salvarHDADebounced(admissionId); },
  });
}

async function onDeleteAnexoHDA(id, admissionId) {
  await DB.remove('attachments', id);
  viewPatientDetail(admissionId, 'hda');
}

// Reabre uma anotação já salva pra continuar editando de verdade — manda o
// histórico de traços (não só a imagem achatada) pro Handwriting, então
// desfazer/apagar traço antigo funciona igual a uma anotação nova. Fotos
// tiradas de câmera/galeria não têm `.tracos`, por isso nunca ganham botão
// de editar (não têm o que reabrir).
function onEditarAnotacao(attachmentId, aoSalvar) {
  DB.get('attachments', attachmentId).then((anexo) => {
    if (!anexo) return;
    Handwriting.abrir({
      tracosIniciais: anexo.tracos || null,
      onSave: async (blob, tracos) => {
        await subirAnexo(anexo.id, blob);
        anexo.tracos = tracos;
        await DB.put('attachments', anexo);
        aoSalvar();
      },
    });
  });
}

// A.P. (Antecedentes Pessoais) — três sub-listas na mesma aba, todas
// guardadas no store "comorbidades" e distinguidas por `categoria`. Registros
// antigos (de antes dessa separação existir) não têm `categoria` — tratados
// como "comorbidade", que era o único tipo que existia até então.
const AP_CATEGORIAS = [
  { key: 'comorbidade', label: 'Comorbidades', placeholder: 'Adicionar comorbidade' },
  { key: 'muc', label: 'M.U.C', placeholder: 'Adicionar medicação de uso contínuo' },
  { key: 'cirurgia', label: 'Cirurgias prévias', placeholder: 'Adicionar cirurgia prévia' },
];

async function tabComorbidades(patient) {
  if (!patient) return '<div class="empty">Sem paciente.</div>';
  const todos = (await DB.where('comorbidades', (c) => c.patientId === patient.id))
    .sort((a, b) => b.criadoEm - a.criadoEm);

  function secaoAP({ key, label, placeholder }) {
    const itens = todos.filter((c) => (c.categoria || 'comorbidade') === key);
    return `
      <div class="section-title">${label}</div>
      <div class="card">
        ${itens.map((c) => `
          <div class="list-item row">
            <span class="${c.ativa ? '' : 'strike'}">${esc(c.texto)}</span>
            <button class="btn-ghost" style="width:auto" onclick="toggleComorbidade('${c.id}')">${c.ativa ? 'Marcar resolvida' : 'Reativar'}</button>
          </div>
        `).join('') || '<div class="list-item">Nada registrado.</div>'}
        <div class="grid2" style="margin-top:10px">
          <input id="novo-ap-${key}" type="text" placeholder="${placeholder}">
          <button class="btn btn-secondary" style="margin-top:0" onclick="onAddComorbidade('${patient.id}','${key}')">Adicionar</button>
        </div>
      </div>
    `;
  }

  return AP_CATEGORIAS.map(secaoAP).join('');
}
async function onAddComorbidade(patientId, categoria) {
  const el = document.getElementById(`novo-ap-${categoria}`);
  const texto = el.value.trim();
  if (!texto) return;
  await addComorbidade(patientId, texto, categoria);
  renderRoute();
}
async function toggleComorbidade(id) {
  const c = await DB.get('comorbidades', id);
  c.ativa = !c.ativa;
  await DB.put('comorbidades', c);
  renderRoute();
}

async function tabExames(admission) {
  const exames = (await DB.where('exams', (e) => e.admissionId === admission.id))
    .sort((a, b) => b.data - a.data);
  const todosAnexos = await DB.all('attachments');
  const contagemAnexos = {};
  for (const a of todosAnexos) contagemAnexos[a.examId] = (contagemAnexos[a.examId] || 0) + 1;

  // exames antigos (de antes desta separação existir) não têm `categoria` —
  // tratamos como laboratorial, que era o único tipo que existia até então
  const imagem = exames.filter((e) => e.categoria === 'imagem');
  const lab = exames.filter((e) => e.categoria !== 'imagem');

  function cartao(e) {
    return `
      <div class="card tappable" onclick="nav('exame-ver/${e.id}')">
        <div class="row">
          <strong>${e.categoria === 'imagem' && e.tipo ? esc(e.tipo) : fmtData(e.data)}</strong>
          ${contagemAnexos[e.id] ? `<span class="pill" style="background:var(--accent-soft);color:var(--accent)">📎 ${contagemAnexos[e.id]}</span>` : ''}
        </div>
        ${e.categoria === 'imagem' ? `<div class="sub">${fmtData(e.data)}</div>` : ''}
        <div class="sub">${renderTexto(e.resultadoResumo) || 'Sem resumo'}</div>
      </div>
    `;
  }

  return `
    <div class="section-title">Exames de imagem</div>
    ${imagem.map(cartao).join('') || '<div class="empty">Nenhum exame de imagem registrado.</div>'}

    <div class="section-title">Exames laboratoriais</div>
    <button class="btn btn-secondary" onclick="nav('tendencia/${admission.id}')">Ver tendência</button>
    ${lab.map(cartao).join('') || '<div class="empty">Nenhum exame laboratorial registrado.</div>'}
  `;
}

// ---------- detalhe do exame + fotos (laudo, tomografia etc.) ----------

async function viewExamDetail(examId) {
  const exame = await DB.get('exams', examId);
  if (!exame) return viewPatientList();
  const admission = await getAdmission(exame.admissionId);
  const anexos = (await DB.where('attachments', (a) => a.examId === examId))
    .sort((a, b) => a.criadoEm - b.criadoEm);

  const thumbs = (await comUrlsAssinadas(anexos)).map((a) => {
    return `
      <div class="card" style="padding:8px">
        <a href="${a.url}" target="_blank" rel="noopener">
          <img src="${a.url}" alt="Anexo do exame" style="width:100%;border-radius:8px;display:block">
        </a>
        <div class="row" style="margin-top:6px">
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewExamDetail('${examId}'); })">✏️ Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAttachment('${a.id}','${examId}')" aria-label="Remover foto" title="Remover">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  const labs = exame.labsBasicos || {};
  const labsHtml = LAB_FIELDS.filter((k) => labs[k] != null)
    .map((k) => `<span class="pill" style="background:var(--accent-soft);color:var(--accent)">${LAB_LABEL[k]}: ${labs[k]}</span>`)
    .join(' ');
  const ehImagem = exame.categoria === 'imagem';

  shell({
    title: ehImagem && exame.tipo ? exame.tipo : fmtData(exame.data),
    back: admission ? `paciente/${admission.id}/exames` : '/',
    body: `
      <div class="card">
        ${ehImagem ? `<div class="sub" style="margin-bottom:6px">${fmtData(exame.data)}</div>` : ''}
        ${labsHtml ? `<div style="margin-bottom:8px">${labsHtml}</div>` : ''}
        <div>${renderTexto(exame.resultadoResumo) || 'Sem resumo'}</div>
      </div>
      <div class="section-title">Fotos / laudo</div>
      <div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
        ${thumbs}
      </div>
      <label style="margin-top:14px">Anexar foto (câmera ou galeria)</label>
      <input type="file" accept="image/*" multiple onchange="onAddAttachment('${examId}', this.files)">
      <button class="btn btn-secondary" onclick="onEscreverAmaoExame('${examId}')">✏️ Escrever à mão</button>
    `,
  });
}

async function onAddAttachment(examId, fileList) {
  for (const file of fileList) {
    const id = newId();
    const storagePath = await subirAnexo(id, file);
    await DB.put('attachments', {
      id, examId, tipo: file.type, storagePath, criadoEm: Date.now(),
    });
  }
  viewExamDetail(examId);
}

function onEscreverAmaoExame(examId) {
  Handwriting.abrir({
    onSave: async (blob, tracos) => {
      const id = newId();
      const storagePath = await subirAnexo(id, blob);
      await DB.put('attachments', { id, examId, tipo: 'image/png', storagePath, tracos, criadoEm: Date.now() });
      viewExamDetail(examId);
    },
  });
}

async function onDeleteAttachment(id, examId) {
  await DB.remove('attachments', id);
  viewExamDetail(examId);
}

async function tabPareceres(admission) {
  const pareceres = (await DB.where('opinions', (o) => o.admissionId === admission.id))
    .sort((a, b) => b.dataHora - a.dataHora);
  return `
    <div class="card">
      <label>Especialidade</label><input id="p-esp" type="text">
      <label>Autor</label><input id="p-autor" type="text">
      <label>Texto</label><textarea id="p-texto" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
      <button class="btn btn-secondary" onclick="onAddParecer('${admission.id}')">Adicionar parecer</button>
    </div>
    ${pareceres.map((p) => `
      <div class="card">
        <div class="row"><strong>${esc(p.especialidade)} — ${esc(p.autor)}</strong></div>
        <div class="sub">${fmtData(p.dataHora, true)}</div>
        <div style="margin-top:6px">${renderTexto(p.texto)}</div>
      </div>
    `).join('')}
  `;
}
async function onAddParecer(admissionId) {
  const especialidade = document.getElementById('p-esp').value.trim();
  const autor = document.getElementById('p-autor').value.trim();
  const texto = document.getElementById('p-texto').value.trim();
  if (!autor || !texto) { Dialog.avisar('Preencha autor e texto.', { tipo: 'erro' }); return; }
  await addOpiniao(admissionId, { especialidade, autor, texto });
  viewPatientDetail(admissionId, 'pareceres');
}

const PLANO_CATEGORIAS = [
  { key: 'residente', label: 'Planos do residente', placeholder: 'Nova conduta/checklist' },
  { key: 'preceptor', label: 'Planos do preceptor', placeholder: 'Nova conduta do preceptor' },
];

async function tabPlanos(admission) {
  const todos = (await DB.where('planItems', (p) => p.admissionId === admission.id))
    .sort((a, b) => b.criadoEm - a.criadoEm);

  function secaoPlano({ key, label, placeholder }) {
    // planos antigos (de antes dessa separação) não têm `categoria` — tratados
    // como "residente", que era o único tipo que existia até então.
    const itens = todos.filter((p) => (p.categoria || 'residente') === key);
    return `
      <div class="section-title">${label}</div>
      <div class="card">
        ${itens.map((p) => `
          <div class="list-item row" onclick="togglePlano('${p.id}')" style="cursor:pointer">
            <span class="${p.concluido ? 'strike' : ''}">${p.concluido ? '☑' : '☐'} ${renderTexto(p.descricao)}</span>
          </div>
        `).join('') || '<div class="list-item">Nenhum plano registrado.</div>'}
        <div class="grid2" style="margin-top:10px">
          <input id="novo-plano-${key}" type="text" placeholder="${placeholder}">
          <button class="btn btn-secondary" style="margin-top:0" onclick="onAddPlano('${admission.id}','${key}')">Adicionar</button>
        </div>
      </div>
    `;
  }

  return PLANO_CATEGORIAS.map(secaoPlano).join('');
}
async function onAddPlano(admissionId, categoria) {
  const el = document.getElementById(`novo-plano-${categoria}`);
  const texto = el.value.trim();
  if (!texto) return;
  await addPlano(admissionId, texto, categoria);
  viewPatientDetail(admissionId, 'planos');
}
async function togglePlano(id) {
  const p = await DB.get('planItems', id);
  p.concluido = !p.concluido;
  await DB.put('planItems', p);
  renderRoute();
}

// ---------- prescrições (foto dos medicamentos em uso) ----------

async function tabPrescricoes(admission) {
  const anexos = (await DB.where('attachments', (a) => a.admissionId === admission.id && a.secao !== 'hda'))
    .sort((a, b) => b.criadoEm - a.criadoEm);

  const thumbs = (await comUrlsAssinadas(anexos)).map((a) => {
    return `
      <div class="card" style="padding:8px">
        <div class="sub" style="margin-bottom:6px">${fmtData(a.criadoEm, true)}</div>
        <a href="${a.url}" target="_blank" rel="noopener">
          <img src="${a.url}" alt="Foto de prescrição" style="width:100%;border-radius:8px;display:block">
        </a>
        <div class="row" style="margin-top:6px">
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','prescricoes'); })">✏️ Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoPrescricao('${a.id}','${admission.id}')" aria-label="Remover foto" title="Remover">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      ${thumbs || '<div class="empty">Nenhuma foto de prescrição ainda.</div>'}
    </div>
    <label>Adicionar foto (câmera ou galeria)</label>
    <input type="file" accept="image/*" multiple onchange="onAddPrescricaoFoto('${admission.id}', this.files)">
    <button class="btn btn-secondary" onclick="onEscreverAmaoPrescricao('${admission.id}')">✍️ Escrever com a Pencil</button>

    <div class="section-title">Observações</div>
    <label>Possíveis usos e datas de uso de ATB</label>
    <textarea id="edit-prescricao-obs" oninput="salvarPrescricaoObsDebounced('${admission.id}')" placeholder="Ex.: Ceftriaxona 1g EV 12/12h desde 07/09 — previsão de 7 dias. Envolva um trecho com ==assim== pra destacar.">${esc(admission.prescricaoObs || '')}</textarea>
    <div id="prescricao-status" class="sub" style="text-align:right;margin-top:4px">${admission.prescricaoObs ? 'Salvo' : ''}</div>
  `;
}

async function onAddPrescricaoFoto(admissionId, fileList) {
  for (const file of fileList) {
    const id = newId();
    const storagePath = await subirAnexo(id, file);
    await DB.put('attachments', { id, admissionId, secao: 'prescricao', tipo: file.type, storagePath, criadoEm: Date.now() });
  }
  viewPatientDetail(admissionId, 'prescricoes');
}

async function onDeleteAnexoPrescricao(id, admissionId) {
  await DB.remove('attachments', id);
  viewPatientDetail(admissionId, 'prescricoes');
}

function onEscreverAmaoPrescricao(admissionId) {
  const campo = document.getElementById('edit-prescricao-obs');
  Scribble.abrir({
    titulo: 'Observações da prescrição',
    valorInicial: campo.value,
    onSalvar: (texto) => { campo.value = texto; salvarPrescricaoObsDebounced(admissionId); },
  });
}

// Sem botão "Salvar": mesmo esquema de debounce de 600ms do HDA/Notepad.
let debounceSalvarPrescricaoObs = null;
function salvarPrescricaoObsDebounced(admissionId) {
  const statusEl = document.getElementById('prescricao-status');
  if (statusEl) statusEl.textContent = 'Salvando…';
  clearTimeout(debounceSalvarPrescricaoObs);
  debounceSalvarPrescricaoObs = setTimeout(async () => {
    const admission = await getAdmission(admissionId);
    admission.prescricaoObs = document.getElementById('edit-prescricao-obs').value.trim();
    await DB.put('admissions', admission);
    const statusAtual = document.getElementById('prescricao-status');
    if (statusAtual) statusAtual.textContent = `Salvo às ${fmtData(Date.now(), true).split(' ')[1]}`;
  }, 600);
}

// Evoluções é uma aba corrida (um único texto indo crescendo, tipo
// protectedtext.com) em vez de fichas separadas por data — quem quiser
// marcar quando escreveu digita a data à mão, o app não impõe estrutura.
// Sinais vitais viraram registros próprios (aba "Sinais Vitais") porque
// precisam de campos numéricos de verdade pra dar gráfico de tendência;
// não dá pra extrair isso de forma confiável de texto livre.
async function tabEvolucoes(admission) {
  // A sincronização (pull) já rodou em viewPatientDetail, antes de qualquer
  // aba — aqui só falta a migração de dados antigos.
  await migrarEvolucaoAntiga(admission);

  const anexos = (await DB.where('attachments', (a) => a.admissionId === admission.id && a.secao === 'evolucao'))
    .sort((a, b) => b.criadoEm - a.criadoEm);

  const thumbs = (await comUrlsAssinadas(anexos)).map((a) => {
    return `
      <div class="card" style="padding:8px">
        <a href="${a.url}" target="_blank" rel="noopener">
          <img src="${a.url}" alt="Anotação do bloco de notas" style="width:100%;border-radius:8px;display:block">
        </a>
        <div class="row" style="margin-top:6px">
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','evolucoes'); })">✏️ Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoEvolucao('${a.id}','${admission.id}')" aria-label="Remover" title="Remover">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <textarea id="edit-evolucao" oninput="onDigitarNotepad(this,'${admission.id}')" placeholder="Escreva aqui. Toque no microfone do teclado pra ditar. Envolva um trecho com ==assim== pra destacar. Valores de lab escritos aqui (ex.: K 4,0 Cl 105 Hb 12) vão sozinhos pra aba Exames conforme você for digitando." style="min-height:420px">${esc(admission.evolucaoTexto || '')}</textarea>
    <div id="notepad-status" class="sub" style="text-align:right;margin-top:4px">${admission.evolucaoTexto ? 'Salvo' : ''}</div>

    <label style="margin-top:14px">Anexar laudo de exame de imagem (câmera ou galeria)</label>
    <input type="file" accept="image/*" multiple onchange="onAnexarLaudoImagem('${admission.id}', this.files)">

    <div class="section-title">Anotações à mão</div>
    ${thumbs ? `<div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:10px">${thumbs}</div>` : ''}
    <button class="btn btn-secondary" onclick="onEscreverAmaoEvolucao('${admission.id}')">✍️ Escrever com a Pencil</button>
  `;
}

// Migração de uma vez só: admissões criadas antes dessa mudança tinham
// evoluções em fichas separadas (store "roundEntries"), cada uma podendo
// levar sinais vitais e uma anotação à mão própria. Aqui isso vira: texto
// concatenado com cabeçalho de data, sinais vitais como registros de
// "vitalSigns", e as anotações à mão reaproveitadas na galeria da própria
// aba Evoluções. `evolucaoTexto` não-nulo (mesmo "") marca que já rodou.
async function migrarEvolucaoAntiga(admission) {
  if (admission.evolucaoTexto != null) return;

  const antigas = (await DB.where('roundEntries', (r) => r.admissionId === admission.id))
    .sort((a, b) => a.createdAt - b.createdAt);

  let texto = '';
  for (const r of antigas) {
    texto += `${texto ? '\n\n' : ''}[${fmtData(r.createdAt, true)}]\n${r.textoLivre || ''}`;
    const sv = r.sinaisVitais || {};
    if (sv.pa || sv.fc || sv.sato2 || sv.tax) {
      const { sistolica, diastolica } = parsePA(sv.pa);
      await DB.put('vitalSigns', {
        id: newId(), admissionId: admission.id, createdAt: r.createdAt,
        // pa antigo era texto livre (ex.: "120x80"); dá pra separar em dois
        // números boa parte das vezes — quando não dá, guarda o texto
        // original mesmo, pra não perder o que já tinha sido registrado.
        pa: sistolica == null ? (sv.pa || null) : null,
        paSistolica: sistolica,
        paDiastolica: diastolica,
        fc: sv.fc !== '' && sv.fc != null ? Number(sv.fc) : null,
        sato2: sv.sato2 !== '' && sv.sato2 != null ? Number(sv.sato2) : null,
        tax: sv.tax || null,
      });
    }
  }

  const idsAntigos = new Set(antigas.map((r) => r.id));
  const anexosAntigos = await DB.where('attachments', (a) => idsAntigos.has(a.roundEntryId));
  for (const a of anexosAntigos) {
    a.admissionId = admission.id;
    a.secao = 'evolucao';
    delete a.roundEntryId;
    await DB.put('attachments', a);
  }

  admission.evolucaoTexto = texto;
  await DB.put('admissions', admission);
}

// Reconhece token de lab (maiúsculas, como convenção clínica já escreve —
// "K"/"Na"/"Cl" maiúsculos evita confundir com preposição comum do
// português) seguido de número. \b antes do token evita casar no meio de
// outra palavra.
const LAB_TOKEN_MAP = {
  Hb: 'hb', Ht: 'ht', VCM: 'vcm', CHCM: 'chcm', Plaq: 'plaq',
  Leucócitos: 'leuco', Leucocitos: 'leuco', Leuco: 'leuco',
  PCR: 'pcr', Ureia: 'ureia', Uréia: 'ureia', Creat: 'creat', Cr: 'creat',
  Na: 'na', K: 'k', Cl: 'cl',
};
function extrairLabsDoTexto(texto) {
  const achados = {};
  const re = new RegExp(`\\b(${Object.keys(LAB_TOKEN_MAP).join('|')})\\s+(\\d+(?:[.,]\\d+)?)`, 'g');
  let m;
  while ((m = re.exec(texto))) {
    const valor = Number(m[2].replace(',', '.'));
    if (!Number.isNaN(valor)) achados[LAB_TOKEN_MAP[m[1]]] = valor;
  }
  return achados;
}
async function mesclarLabsHoje(admissionId, achados) {
  const exames = await DB.where('exams', (e) => e.admissionId === admissionId && e.categoria !== 'imagem');
  const hojeStr = fmtData(Date.now());
  let hoje = exames.find((e) => fmtData(e.data) === hojeStr);
  if (!hoje) {
    hoje = { id: newId(), admissionId, categoria: 'lab', data: Date.now(), resultadoResumo: '', labsBasicos: {} };
  }
  hoje.labsBasicos = { ...(hoje.labsBasicos || {}), ...achados };
  await DB.put('exams', hoje);
}

// Caixa "infinita": em vez de altura fixa com scroll interno, ela cresce pra
// caber o texto todo — sem limite. Chamado a cada tecla e uma vez logo após
// o render (o valor inicial já pode ser mais alto que os 420px de partida).
function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// Sem botão "Salvar": tudo — o texto em si e a sincronização com a aba
// Exames — vai sozinho pro banco 600ms depois de parar de digitar. Não
// re-renderiza a tela nesse meio tempo (perderia o cursor no meio da
// frase); só atualiza o textinho de status, igual um "Salvo" de editor de
// texto comum, pra dar certeza visível de que já gravou sem precisar clicar
// em nada.
let debounceSyncNotepad = null;
function onDigitarNotepad(campo, admissionId) {
  autoResizeTextarea(campo);
  const statusEl = document.getElementById('notepad-status');
  if (statusEl) statusEl.textContent = 'Salvando…';
  clearTimeout(debounceSyncNotepad);
  debounceSyncNotepad = setTimeout(async () => {
    const texto = campo.value;
    const admission = await getAdmission(admissionId);
    admission.evolucaoTexto = texto;
    await DB.put('admissions', admission);

    const achados = extrairLabsDoTexto(texto);
    if (Object.keys(achados).length) await mesclarLabsHoje(admissionId, achados);

    const statusAtual = document.getElementById('notepad-status');
    if (statusAtual) statusAtual.textContent = `Salvo às ${fmtData(Date.now(), true).split(' ')[1]}`;
  }, 600);
}

async function onAnexarLaudoImagem(admissionId, fileList) {
  if (!fileList.length) return;
  const exame = { id: newId(), admissionId, categoria: 'imagem', data: Date.now(), tipo: '', resultadoResumo: '', labsBasicos: {} };
  await DB.put('exams', exame);
  for (const file of fileList) {
    const id = newId();
    const storagePath = await subirAnexo(id, file);
    await DB.put('attachments', { id, examId: exame.id, tipo: file.type, storagePath, criadoEm: Date.now() });
  }
  viewPatientDetail(admissionId, 'evolucoes');
  Dialog.avisar('Laudo adicionado à aba Exames.', { tipo: 'sucesso' });
}

function onEscreverAmaoEvolucao(admissionId) {
  const campo = document.getElementById('edit-evolucao');
  Scribble.abrir({
    titulo: 'Evolução',
    valorInicial: campo.value,
    onSalvar: (texto) => { campo.value = texto; onDigitarNotepad(campo, admissionId); },
  });
}

async function onDeleteAnexoEvolucao(id, admissionId) {
  await DB.remove('attachments', id);
  viewPatientDetail(admissionId, 'evolucoes');
}

// ---------- sinais vitais ----------

const VITAL_FIELDS = ['paSistolica', 'paDiastolica', 'fc', 'sato2', 'tax'];
const VITAL_LABEL = { paSistolica: 'PA máx', paDiastolica: 'PA mín', fc: 'FC', sato2: 'SatO2', tax: 'Tax' };
let vitaisChartPontos = null;
let vitaisAnalitoAtual = 'fc';

// Separa um texto livre tipo "120x80" / "120/80" em dois números — usado só
// pra aproveitar registros antigos (de antes de PA virar dois campos
// próprios). Quando não dá pra separar, sobra null nos dois.
function parsePA(texto) {
  if (!texto) return { sistolica: null, diastolica: null };
  const m = String(texto).match(/(\d+)\s*[x×/]\s*(\d+)/i);
  if (!m) return { sistolica: null, diastolica: null };
  return { sistolica: Number(m[1]), diastolica: Number(m[2]) };
}
// PA pra exibição: usa os campos numéricos quando existem; cai pro texto
// livre (registro antigo que não deu pra separar) como último recurso.
function formatarPA(v) {
  if (v.paSistolica != null || v.paDiastolica != null) {
    return `${v.paSistolica ?? '?'}/${v.paDiastolica ?? '?'}`;
  }
  return v.pa || null;
}

async function tabVitais(admission) {
  const registros = (await DB.where('vitalSigns', (v) => v.admissionId === admission.id))
    .sort((a, b) => b.createdAt - a.createdAt);

  const analito = vitaisAnalitoAtual;
  // Registros bem antigos (de antes de PA virar dois campos) só têm o texto
  // livre — tenta separar aqui também, só pra entrarem no gráfico.
  const valorDoAnalito = (r) => {
    if ((analito === 'paSistolica' || analito === 'paDiastolica') && r[analito] == null && r.pa) {
      const p = parsePA(r.pa);
      return analito === 'paSistolica' ? p.sistolica : p.diastolica;
    }
    return r[analito];
  };
  const comValor = registros
    .map((r) => ({ r, valor: valorDoAnalito(r) }))
    .filter(({ valor }) => valor != null && valor !== '')
    .sort((a, b) => a.r.createdAt - b.r.createdAt);
  vitaisChartPontos = comValor.length ? comValor.map(({ r, valor }) => ({ x: r.createdAt, y: Number(valor) })) : null;

  const botoesAnalito = VITAL_FIELDS.map((k) =>
    `<button class="${k === analito ? 'active' : ''}" onclick="onTrocarAnalitoVitais('${admission.id}','${k}')">${VITAL_LABEL[k]}</button>`
  ).join('');

  const linhas = registros.map((r) => {
    const pa = formatarPA(r);
    return `
    <div class="list-item">
      <div class="meta">${fmtData(r.createdAt, true)}</div>
      <div>${[
        pa ? `PA ${esc(pa)}` : '',
        r.fc != null ? `FC ${r.fc}` : '',
        r.sato2 != null ? `SatO2 ${r.sato2}%` : '',
        r.tax ? `Tax ${esc(r.tax)}` : '',
      ].filter(Boolean).join(' · ') || '—'}</div>
    </div>
  `;
  }).join('') || '<div class="list-item">Nenhum registro ainda.</div>';

  return `
    <div class="grid2">
      <input id="v-pa-sist" type="number" placeholder="PA máxima">
      <input id="v-pa-diast" type="number" placeholder="PA mínima">
    </div>
    <div class="grid2" style="margin-top:8px">
      <input id="v-fc" type="number" placeholder="FC">
      <input id="v-sato2" type="number" placeholder="SatO2">
    </div>
    <input id="v-tax" type="text" placeholder="Tax" style="margin-top:8px">
    <button class="btn btn-secondary" onclick="onAddVitalSigns('${admission.id}')">Adicionar</button>

    <div class="section-title">Evolução</div>
    <div class="tabs">${botoesAnalito}</div>
    <div class="chart-wrap">
      ${vitaisChartPontos ? `<canvas id="vitais-canvas" width="560" height="220" style="width:100%"></canvas>` : '<div class="empty">Sem registros desse sinal ainda.</div>'}
    </div>

    <div class="section-title">Histórico</div>
    <div class="card">${linhas}</div>
  `;
}

function onTrocarAnalitoVitais(admissionId, analito) {
  vitaisAnalitoAtual = analito;
  viewPatientDetail(admissionId, 'vitais');
}

async function onAddVitalSigns(admissionId) {
  const paSist = document.getElementById('v-pa-sist').value;
  const paDiast = document.getElementById('v-pa-diast').value;
  const fc = document.getElementById('v-fc').value;
  const sato2 = document.getElementById('v-sato2').value;
  const tax = document.getElementById('v-tax').value.trim();
  if (paSist === '' && paDiast === '' && fc === '' && sato2 === '' && !tax) return;
  await DB.put('vitalSigns', {
    id: newId(), admissionId, createdAt: Date.now(),
    paSistolica: paSist !== '' ? Number(paSist) : null,
    paDiastolica: paDiast !== '' ? Number(paDiast) : null,
    fc: fc !== '' ? Number(fc) : null,
    sato2: sato2 !== '' ? Number(sato2) : null,
    tax: tax || null,
  });
  viewPatientDetail(admissionId, 'vitais');
}

// ---------- novo exame ----------

const LAB_FIELDS = ['hb', 'ht', 'vcm', 'chcm', 'plaq', 'leuco', 'pcr', 'ureia', 'creat', 'na', 'k', 'cl'];
const LAB_LABEL = { hb: 'Hb', ht: 'Ht', vcm: 'VCM', chcm: 'CHCM', plaq: 'Plaq', leuco: 'Leucócitos', pcr: 'PCR', ureia: 'Ureia', creat: 'Creatinina', na: 'Na', k: 'K', cl: 'Cl' };

function viewNewExam(admissionId, categoria = 'lab') {
  const camposLab = `
    <div class="section-title">Labs rápidos</div>
    <div class="grid3">
      ${LAB_FIELDS.map((k) => `<input id="lab-${k}" type="number" step="any" placeholder="${LAB_LABEL[k]}">`).join('')}
    </div>
    <label>Resumo / demais exames</label>
    <textarea id="e-resumo" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
  `;
  const camposImagem = `
    <label>Tipo de exame</label>
    <input id="e-tipo" type="text" placeholder="Ex.: TC de crânio, RM de coluna lombar">
    <label>Achados / laudo</label>
    <textarea id="e-resumo" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
  `;
  shell({
    title: 'Exame', back: `paciente/${admissionId}/exames`,
    body: `
      <div class="tabs">
        <button class="${categoria === 'lab' ? 'active' : ''}" onclick="nav('exame/${admissionId}/lab')">Laboratorial</button>
        <button class="${categoria === 'imagem' ? 'active' : ''}" onclick="nav('exame/${admissionId}/imagem')">Imagem</button>
      </div>
      <label>Data</label>
      <input id="e-data" type="date" value="${hojeLocalISO()}">
      ${categoria === 'imagem' ? camposImagem : camposLab}
      ${categoria === 'imagem' ? '<p style="font-size:12.5px;color:var(--ink-soft)">Depois de salvar, você anexa a foto do laudo/imagem na tela do exame.</p>' : ''}
      <button class="btn btn-primary" onclick="salvarExame('${admissionId}','${categoria}')">Salvar</button>
    `,
  });
}
async function salvarExame(admissionId, categoria) {
  const exame = {
    id: newId(), admissionId, categoria,
    data: dataLocalDeInput(document.getElementById('e-data').value),
    resultadoResumo: document.getElementById('e-resumo').value.trim(),
    labsBasicos: {},
  };
  if (categoria === 'imagem') {
    exame.tipo = document.getElementById('e-tipo').value.trim();
  } else {
    for (const k of LAB_FIELDS) {
      const v = document.getElementById(`lab-${k}`).value;
      if (v !== '') exame.labsBasicos[k] = Number(v);
    }
  }
  await DB.put('exams', exame);
  nav(`paciente/${admissionId}/exames`);
}

// ---------- tendência ----------

async function viewTrend(admissionId, analito = 'creat') {
  const exames = (await DB.where('exams', (e) => e.admissionId === admissionId))
    .filter((e) => e.labsBasicos && e.labsBasicos[analito] != null)
    .sort((a, b) => a.data - b.data);

  const botoes = LAB_FIELDS.map((k) =>
    `<button class="${k === analito ? 'active' : ''}" onclick="viewTrend('${admissionId}','${k}')">${LAB_LABEL[k]}</button>`
  ).join('');

  shell({
    title: 'Tendência de exames', back: `paciente/${admissionId}/exames`,
    body: `
      <div class="tabs vertical">${botoes}</div>
      <div class="chart-wrap">
        ${exames.length ? `<canvas id="trend-canvas" width="560" height="220" style="width:100%"></canvas>` : '<div class="empty">Sem exames com esse valor.</div>'}
      </div>
    `,
  });

  if (exames.length) desenharTendencia('trend-canvas', exames.map((e) => ({ x: e.data, y: e.labsBasicos[analito] })));
}

function desenharTendencia(canvasId, pontos) {
  const c = document.getElementById(canvasId);
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height, PAD = 32;
  ctx.clearRect(0, 0, W, H);

  const ys = pontos.map((p) => p.y);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const xs = pontos.map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const rangeX = maxX - minX || 1;

  const px = (x) => PAD + ((x - minX) / rangeX) * (W - PAD * 2);
  const py = (y) => H - PAD - ((y - minY) / rangeY) * (H - PAD * 2);

  ctx.strokeStyle = '#e0e0e0';
  ctx.beginPath(); ctx.moveTo(PAD, H - PAD); ctx.lineTo(W - PAD, H - PAD); ctx.stroke();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  pontos.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y))));
  ctx.stroke();

  ctx.fillStyle = '#000000';
  pontos.forEach((p) => { ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 4, 0, Math.PI * 2); ctx.fill(); });

  ctx.fillStyle = '#757575';
  ctx.font = '11px "Inter Variable", -apple-system, sans-serif';
  ctx.fillText(String(maxY), 4, py(maxY) + 4);
  ctx.fillText(String(minY), 4, py(minY) + 4);
}

// ---------- relatório mensal ----------

async function viewReport(ano, mes) {
  const agora = new Date();
  ano = ano ?? agora.getFullYear();
  mes = mes ?? agora.getMonth();

  const porHDFinal = await Report.mensal(ano, mes);
  // text-transform:capitalize deixava "Setembro De 2026" — capitalizava
  // também o "de", que toLocaleDateString devolve minúsculo. Capitaliza só
  // a primeira letra da string inteira em vez disso.
  const nomeMesBruto = new Date(ano, mes, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const nomeMes = nomeMesBruto.charAt(0).toUpperCase() + nomeMesBruto.slice(1);

  shell({
    title: 'Relatório mensal', back: '/',
    body: `
      <div class="row" style="justify-content:center;gap:16px;margin-bottom:14px">
        <button class="icon-btn" onclick="viewReport(${mes === 0 ? ano - 1 : ano}, ${mes === 0 ? 11 : mes - 1})">‹</button>
        <strong>${nomeMes}</strong>
        <button class="icon-btn" onclick="viewReport(${mes === 11 ? ano + 1 : ano}, ${mes === 11 ? 0 : mes + 1})">›</button>
      </div>

      <div class="section-title">Altas por hipótese diagnóstica</div>
      <p class="sub" style="margin:-4px 0 10px">Toque num nome pra renomear — usar o mesmo nome de outra categoria junta as duas aqui.</p>
      <div class="card">
        ${porHDFinal.map((l) => `
          <div class="list-item row ${l.renomeavel ? 'tappable' : ''}" ${l.renomeavel ? `onclick="onRenomearCategoriaHD('${esc(l.categoria)}', ${ano}, ${mes})"` : ''}>
            <span>${esc(l.categoria)}</span><strong>${l.total}</strong>
          </div>
        `).join('') || '<div class="list-item">Nenhuma alta registrada neste mês.</div>'}
      </div>
    `,
  });
}

async function onRenomearCategoriaHD(nomeAtual, ano, mes) {
  const novoNome = await Dialog.perguntar({
    titulo: 'Renomear categoria diagnóstica',
    mensagem: `Atualiza "${nomeAtual}" em todas as internações que usam essa categoria. Usar o mesmo nome de outra categoria já existente junta as duas neste relatório.`,
    valorInicial: nomeAtual,
    textoConfirmar: 'Renomear',
  });
  if (novoNome === null) return;
  const nomeLimpo = novoNome.trim();
  if (!nomeLimpo || nomeLimpo === nomeAtual) return;

  const categorias = await DB.where('diagnosisCategories', (c) => c.nome === nomeAtual);
  for (const c of categorias) {
    c.nome = nomeLimpo;
    c.nomeNormalizado = Matching.normalizar(nomeLimpo);
    await DB.put('diagnosisCategories', c);
  }
  viewReport(ano, mes);
}

// ---------- arquivo ----------

async function viewArchiveList() {
  const admissoes = (await DB.where('admissions', (a) => a.status === 'arquivado'))
    .sort((a, b) => b.dataAdmissao - a.dataAdmissao);
  const patients = Object.fromEntries((await DB.all('patients')).map((p) => [p.id, p]));

  shell({
    title: 'Arquivo', back: '/',
    body: admissoes.map((a) => `
      <div class="card tappable" onclick="nav('paciente/${a.id}')">
        <div class="leito">${esc(a.leito)}</div>
        <div class="sub">${esc(patients[a.patientId]?.nomeCompleto || patients[a.patientId]?.iniciais || '')} — admitido em ${fmtData(a.dataAdmissao)}</div>
      </div>
    `).join('') || '<div class="empty">Nada arquivado ainda.</div>',
  });
}

boot();
