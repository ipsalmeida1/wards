// App principal: roteamento por hash + render via innerHTML. Sem framework —
// app pequeno, uso pessoal, prioridade é funcionar 100% offline sem build.

const { Store: DB, uuid: newId } = window.WardsDB;
const $app = () => document.getElementById('app');

function timestampParaInputISO(ts) {
  const d = new Date(ts);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
function hojeLocalISO() {
  return timestampParaInputISO(Date.now());
}
function dataLocalDeInput(valorYYYYMMDD) {
  const [ano, mes, dia] = valorYYYYMMDD.split('-').map(Number);
  return new Date(ano, mes - 1, dia).getTime();
}

// Ícones Lucide (lucide.dev, ISC license) embutidos como SVG inline — sem
// biblioteca/CDN em runtime, sem passo de build: só o <path> de cada ícone
// que o app realmente usa, colado direto no template. `currentColor` puxa a
// cor do texto ao redor (funciona sozinho em botão normal, ativo, no FAB
// preto etc.); o tamanho pedido já escala a --stroke-width junto, então um
// ícone de 18px sai com ~1,5px de traço — o esperado ao lado de texto
// regular (ver better-ui: traço bate com o peso do texto vizinho).
const LUCIDE_PATHS = {
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  'square-check': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m16 9-5.5 5.5L8 12"/>',
  square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  'chart-column': '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  'log-out': '<path d="m16 17 5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  paperclip: '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
  'list-checks': '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  'file-text': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  'heart-pulse': '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/><path d="M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  'message-square': '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
function icone(nome, tamanho = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;flex:none">${LUCIDE_PATHS[nome]}</svg>`;
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
  if (parts[0] === 'pendencias') return viewPendencias();
  if (parts[0] === 'pacientes') return viewPatientList();
  return viewHome();
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
      ${back ? `<button class="back" onclick="nav('${back}')">${icone('chevron-left', 15)} Voltar</button>` : '<span></span>'}
      <h1>${esc(title)}</h1>
      <span>${right || ''}</span>
    </header>
    <main>${body}</main>
    ${fabHtml ? `<div class="fab">${fabHtml}</div>` : ''}
  `);
}

// ---------- início ----------

// Tela raiz (hash vazio) — de propósito NÃO é a lista de pacientes: chegar
// aqui e já ter que decidir "pacientes, pendências, relatório ou arquivo"
// evita que "Pacientes do dia" seja a porta de entrada obrigatória do app.
// Os dois números do topo reaproveitam a mesma regra de "pendência" da
// tela de Pendências (plano aberto OU prescrição de hoje não marcada) —
// contam pacientes, não itens, pra bater com o que a tela de Pendências
// mostra (uma seção por paciente).
async function viewHome() {
  const admissoes = await DB.where('admissions', (a) => a.status === 'ativo');
  const hoje = hojeLocalISO();
  let comPendencia = 0;
  for (const a of admissoes) {
    const temPlanoAberto = (await DB.where('planItems', (p) => p.admissionId === a.id && !p.concluido)).length > 0;
    if (temPlanoAberto || a.prescricaoCheckDia !== hoje) comPendencia++;
  }

  const dataBruta = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const dataFormatada = dataBruta.charAt(0).toUpperCase() + dataBruta.slice(1);
  const atalho = (rota, nome, label) => `
    <div class="card tappable" onclick="nav('${rota}')">
      <div class="row">
        <span>${icone(nome)} ${label}</span>
        ${icone('chevron-right', 16)}
      </div>
    </div>
  `;

  shell({
    title: 'Wards',
    right: `<button class="icon-btn" onclick="onSair()" title="Sair" aria-label="Sair">${icone('log-out')}</button>`,
    body: `
      <div class="sub" style="margin-bottom:14px">${esc(dataFormatada)}</div>
      <div class="grid2" style="margin-bottom:14px">
        <div class="card" style="margin-bottom:0;text-align:center">
          <div style="font-size:28px;font-weight:600;line-height:1">${admissoes.length}</div>
          <div class="sub">Paciente${admissoes.length === 1 ? '' : 's'} ativo${admissoes.length === 1 ? '' : 's'}</div>
        </div>
        <div class="card" style="margin-bottom:0;text-align:center">
          <div style="font-size:28px;font-weight:600;line-height:1">${comPendencia}</div>
          <div class="sub">Com pendência hoje</div>
        </div>
      </div>
      ${atalho('pacientes', 'bed', 'Pacientes do dia')}
      ${atalho('pendencias', 'list-checks', 'Pendências')}
      ${atalho('relatorio', 'chart-column', 'Relatório mensal')}
      ${atalho('arquivo', 'archive', 'Arquivo')}
    `,
  });
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
        <div class="swipe-action" onclick="onExcluirAdmissao('${a.id}')">${icone('trash', 20)}<br>Excluir</div>
        <div class="card tappable swipe-content" onclick="onCliqueCardPaciente(this, '${a.id}')">
          <div class="row">
            <div class="row" style="gap:8px;flex:none">
              <button class="icon-btn" style="width:auto;font-size:19px;padding:4px" onclick="event.stopPropagation(); onTogglePrescricaoCheck('${a.id}')" title="Prescrição feita hoje" aria-label="Prescrição feita hoje">${a.prescricaoCheckDia === hojeLocalISO() ? icone('square-check') : icone('square')}</button>
              <span class="leito">${esc(a.leito)}</span>
            </div>
            <button class="icon-btn" style="width:auto;font-size:19px" onclick="event.stopPropagation(); onDarAltaDireto('${a.id}')" title="Dar alta" aria-label="Dar alta">${icone('house')}</button>
          </div>
          <div class="sub">${esc(p.nomeCompleto || p.iniciais || 'sem paciente')} — admitido em ${fmtData(a.dataAdmissao)}</div>
          ${a.motivoAdmissao ? `<div class="sub">${esc(a.motivoAdmissao)}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  shell({
    title: 'Pacientes do dia',
    back: '/',
    right: `<button class="icon-btn" onclick="nav('pendencias')" title="Pendências" aria-label="Pendências">${icone('list-checks')}</button><button class="icon-btn" onclick="nav('arquivo')" title="Arquivo" aria-label="Arquivo">${icone('archive')}</button><button class="icon-btn" onclick="nav('relatorio')" title="Relatório" aria-label="Relatório">${icone('chart-column')}</button>`,
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
    title: 'Novo paciente', back: 'pacientes',
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

// HDA/A.P/Sinais Vitais/Pareceres saem da barra de abas de cima e viram uma
// gaveta lateral (ícone + rótulo), que abre/fecha por cima do conteúdo —
// deixa só 4 abas na barra de cima (era 8), mais limpo e sem rolagem
// horizontal escondendo metade delas.
const TABS_GAVETA = ['hda', 'comorbidades', 'vitais', 'pareceres'];
const TABS_TOPO = ['evolucoes', 'exames', 'planos', 'prescricoes'];
const TAB_LABEL = {
  hda: 'HDA', comorbidades: 'A.P', vitais: 'Sinais Vitais', exames: 'Exames',
  pareceres: 'Pareceres', planos: 'Planos', evolucoes: 'Bloco de Notas',
  prescricoes: 'Prescrições',
};
const TAB_ICON = { hda: 'file-text', comorbidades: 'heart-pulse', vitais: 'activity', pareceres: 'message-square' };

let gavetaAbasAberta = false;
function onAlternarGavetaAbas() {
  gavetaAbasAberta = !gavetaAbasAberta;
  renderRoute();
}
function onEscolherAbaGaveta(admissionId, t) {
  gavetaAbasAberta = false;
  nav(`paciente/${admissionId}/${t}`);
}

async function viewPatientDetail(admissionId, tab) {
  const admission = await getAdmission(admissionId);
  if (!admission) return viewPatientList();
  const patient = await getPatient(admission.patientId);

  const naGaveta = TABS_GAVETA.includes(tab);
  const gatilhoGaveta = naGaveta
    ? `<button class="active" onclick="onAlternarGavetaAbas()" style="display:flex;align-items:center;gap:6px">${icone(TAB_ICON[tab])} ${TAB_LABEL[tab]}</button>`
    : `<button onclick="onAlternarGavetaAbas()" aria-label="Mais abas" title="Mais abas">${icone('panel-left')}</button>`;
  const tabsHtml = gatilhoGaveta + TABS_TOPO.map((t) =>
    `<button class="${t === tab ? 'active' : ''}" onclick="nav('paciente/${admissionId}/${t}')">${TAB_LABEL[t]}</button>`
  ).join('');

  const gavetaHtml = `
    <div class="side-drawer-overlay" style="display:${gavetaAbasAberta ? 'block' : 'none'}" onclick="onAlternarGavetaAbas()"></div>
    <div class="side-drawer ${gavetaAbasAberta ? 'aberta' : ''}">
      ${TABS_GAVETA.map((t) => `
        <div class="side-drawer-item ${t === tab ? 'active' : ''}" onclick="onEscolherAbaGaveta('${admissionId}','${t}')">
          ${icone(TAB_ICON[t], 20)} ${TAB_LABEL[t]}
        </div>
      `).join('')}
    </div>
  `;

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
    back: 'pacientes',
    right: `<button class="icon-btn no-print" onclick="window.print()" title="Imprimir" aria-label="Imprimir">${icone('printer')}</button>`,
    body: `<div class="tabs">${tabsHtml}</div>${gavetaHtml}${body}`,
    fabHtml: tab === 'exames'
      ? `<button class="btn btn-primary" style="width:100%" onclick="nav('exame/${admissionId}')">+ Exame</button>`
      : '',
  });

  if (tab === 'vitais' && vitaisChartPontos) desenharTendencia('vitais-canvas', vitaisChartPontos);
  if (tab === 'evolucoes') autoResizeTextarea(document.getElementById('edit-evolucao'));
}

const STATUS_LABEL = { ativo: 'Ativo', alta: 'Alta', obito: 'Óbito', arquivado: 'Arquivado' };

// "Dar alta" agora se faz direto na lista de pacientes (ícone de casa no card) —
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

// Checklist do dia, direto na lista: um quadradinho por paciente pra marcar
// "prescrição feita hoje" sem precisar entrar na ficha. Guarda só a DATA
// (não um booleano solto), então o check se desmarca sozinho no dia
// seguinte — precisa ser refeito a cada rodada, que é como prescrição
// funciona na prática (reescrita todo dia, não uma tarefa de uma vez só).
async function onTogglePrescricaoCheck(admissionId) {
  const a = await getAdmission(admissionId);
  const hoje = hojeLocalISO();
  a.prescricaoCheckDia = a.prescricaoCheckDia === hoje ? null : hoje;
  await DB.put('admissions', a);
  renderRoute();
}

// Resumo por data da HDA — mecânico, sem IA: acha marcas "dia DD/MM" no
// texto (convenção de quem escreve a HDA cronologicamente, ex.: "dia
// 25/08: dor no corpo e febre, dia 27/08 rash cutâneo") e usa o trecho
// entre uma marca e a próxima como aquele dia. Corta na primeira frase
// (até ./!/quebra de linha) só por estrutura — não julga o que é
// "importante", só evita uma linha do resumo virar o parágrafo inteiro.
// `inicioTexto`/`fimTexto` marcam onde a frase reconhecida (l.texto, ANTES
// do replace de vírgula/ponto-e-vírgula final) começa e termina dentro do
// texto ORIGINAL — é o que permite editar uma entrada da linha do tempo e
// regravar só aquele pedacinho na HDA de verdade, sem arriscar apagar o que
// vem depois (texto extra até a próxima marca "dia", que não aparece no
// resumo mas continua existindo na HDA).
function extrairResumoPorData(texto) {
  const reData = /dia\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s*:?\s*/gi;
  const marcas = [...(texto || '').matchAll(reData)];
  if (!marcas.length) return [];
  return marcas.map((m, i) => {
    const inicioBloco = m.index + m[0].length;
    const fimBloco = i + 1 < marcas.length ? marcas[i + 1].index : texto.length;
    const bloco = texto.slice(inicioBloco, fimBloco);
    const espacoInicial = bloco.match(/^\s*/)[0].length;
    const semEspaco = bloco.slice(espacoInicial);
    const primeiraFrase = semEspaco.match(/^[^.!?\n]+[.!?]?/);
    const trechoBruto = primeiraFrase ? primeiraFrase[0] : semEspaco;
    const inicioTexto = inicioBloco + espacoInicial;
    const fimTexto = inicioTexto + trechoBruto.length;
    const texto2 = trechoBruto.trim().replace(/[,;]+$/, '').trim();
    return { data: m[1], texto: texto2, inicioTexto, fimTexto };
  }).filter((l) => l.texto);
}

// Linha do tempo: leitura automática da história natural, organizada por
// data a partir do texto da HDA (convenção "dia DD/MM: ..."). Fica sempre
// visível, sem clique nenhum — some sozinha quando não há data reconhecida,
// aparece sozinha assim que a primeira surge. De propósito sem card nem
// título próprio ("Linha do tempo"): são só linhas discretas coladas na
// label "HDA", não uma seção separada que precisa de nome.
//
// Cada linha é editável (o texto, não a data): um <input> que parece texto
// solto até ganhar foco. Ao perder o foco, regrava só aquele trecho de volta
// na HDA de verdade (ver onEditarLinhaDoTempo) e recalcula tudo a partir do
// texto novo — por isso só confirma no blur/Enter, nunca a cada tecla (senão
// o próprio re-render destruiria o cursor no meio da edição).
function htmlLinhaDoTempoHDA(resumoPorData, admissionId) {
  if (!resumoPorData.length) return '';
  return resumoPorData.map((l) => `
    <div class="sub linha-tempo-linha">
      <strong>${esc(l.data)}:</strong>
      <input type="text" class="linha-tempo-input" value="${esc(l.texto)}"
        onblur="onEditarLinhaDoTempo(this,'${admissionId}',${l.inicioTexto},${l.fimTexto})"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
    </div>
  `).join('');
}

// Regrava só o trecho editado de volta na HDA (usando os offsets do texto
// ORIGINAL que estava na tela quando a linha do tempo foi desenhada) e
// recalcula a linha do tempo inteira a partir do resultado — os offsets das
// outras linhas mudam se o tamanho do texto mudou, então nunca dá pra só
// atualizar essa uma entrada isolada.
async function onEditarLinhaDoTempo(inputEl, admissionId, inicioTexto, fimTexto) {
  const campo = document.getElementById('edit-hda');
  const hdaAtual = campo.value;
  const novoHda = hdaAtual.slice(0, inicioTexto) + inputEl.value.trim() + hdaAtual.slice(fimTexto);
  campo.value = novoHda;
  onDigitarHDA(campo, admissionId);
  salvarHDADebounced(admissionId);
}

// Atualiza a linha do tempo ao vivo, a cada tecla — sem re-renderizar a tela
// (perderia o cursor no meio da frase). Quem grava de verdade no banco é o
// salvarHDADebounced, chamado à parte no mesmo oninput.
function onDigitarHDA(campo, admissionId) {
  const wrap = document.getElementById('hda-linha-tempo-wrap');
  if (wrap) wrap.innerHTML = htmlLinhaDoTempoHDA(extrairResumoPorData(campo.value), admissionId);
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
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','hda'); })">${icone('pencil')} Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoHDA('${a.id}','${admission.id}')" aria-label="Remover" title="Remover">${icone('trash')}</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${statusCard(admission)}
    <label>Motivo da admissão</label>
    <input id="edit-motivo" type="text" value="${esc(admission.motivoAdmissao || '')}" oninput="salvarHDADebounced('${admission.id}')">
    <label>HDA</label>
    <div id="hda-linha-tempo-wrap">${htmlLinhaDoTempoHDA(resumoPorData, admission.id)}</div>
    <textarea id="edit-hda" oninput="onDigitarHDA(this,'${admission.id}'); salvarHDADebounced('${admission.id}')" placeholder="Envolva um trecho com ==assim== pra destacar. Escrever cronologicamente? Use &quot;dia 25/08: ...&quot; pra ganhar uma linha do tempo automática aqui em cima." style="min-height:260px">${esc(admission.hda || '')}</textarea>
    <div id="hda-status" class="sub" style="text-align:right;margin-top:4px">${(admission.motivoAdmissao || admission.hda) ? 'Salvo' : ''}</div>

    <div class="row" style="margin:14px 0 6px">
      <div class="section-title" style="margin:0">Anotações à mão</div>
      <button class="icon-btn" style="width:auto" onclick="onEscreverAmaoHDA('${admission.id}')" aria-label="Escrever com a Pencil" title="Escrever com a Pencil">${icone('pencil')}</button>
    </div>
    ${thumbs ? `<div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:10px">${thumbs}</div>` : ''}

    <div class="section-title">Lista de problemas</div>
    <div class="card">
      ${problemas.map((p, i) => `
        <div class="list-item row">
          <span>${esc(p.textoDigitado)}</span>
          <div class="row" style="gap:0;flex:none">
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" ${i === 0 ? 'disabled' : ''} onclick="onMoverProblema('${p.id}','${admission.id}',-1)" aria-label="Mais prioritário" title="Mais prioritário">${icone('chevron-up', 14)}</button>
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" ${i === problemas.length - 1 ? 'disabled' : ''} onclick="onMoverProblema('${p.id}','${admission.id}',1)" aria-label="Menos prioritário" title="Menos prioritário">${icone('chevron-down', 14)}</button>
            <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" onclick="onRemoverProblema('${p.id}','${admission.id}')" aria-label="Remover problema" title="Remover">${icone('trash')}</button>
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
    onSalvar: (texto) => { campo.value = texto; onDigitarHDA(campo, admissionId); salvarHDADebounced(admissionId); },
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
  const exames = await DB.where('exams', (e) => e.admissionId === admission.id);
  const todosAnexos = await DB.all('attachments');
  const contagemAnexos = {};
  for (const a of todosAnexos) contagemAnexos[a.examId] = (contagemAnexos[a.examId] || 0) + 1;

  // exames antigos (de antes desta separação existir) não têm `categoria` —
  // tratamos como laboratorial, que era o único tipo que existia até então
  const imagem = exames.filter((e) => e.categoria === 'imagem').sort((a, b) => b.data - a.data);
  // Ordem crescente (mais antigo primeiro) pra tabela ler da esquerda pra
  // direita como uma planilha de acompanhamento de verdade.
  const lab = exames.filter((e) => e.categoria !== 'imagem').sort((a, b) => a.data - b.data);
  const cultura = lab.filter((e) => e.categoria === 'cultura');
  const labNumerico = lab.filter((e) => e.categoria !== 'cultura');

  // Imagem tem cara de card (tipo, data, laudo) — uma foto de exame é algo
  // discreto, merece sua própria caixa.
  function cartao(e) {
    const titulo = e.tipo ? esc(e.tipo) : fmtData(e.data);
    return `
      <div class="card tappable" onclick="nav('exame-ver/${e.id}')">
        <div class="row">
          <strong>${titulo}</strong>
          ${contagemAnexos[e.id] ? `<span class="pill" style="background:var(--accent-soft);color:var(--accent)">${icone('paperclip', 12)} ${contagemAnexos[e.id]}</span>` : ''}
        </div>
        <div class="sub">${fmtData(e.data)}</div>
        <div class="sub" style="margin-top:2px">${renderTexto(e.resultadoResumo) || 'Sem resumo'}</div>
      </div>
    `;
  }
  // Cultura entra na parte laboratorial, mas não cabe numa célula numérica
  // — vira uma linha de lista simples, logo abaixo da planilha.
  function linhaCultura(e) {
    return `
      <div class="list-item tappable" onclick="nav('exame-ver/${e.id}')">
        <div class="row">
          <strong>${e.tipo ? esc(e.tipo) : fmtData(e.data)}</strong>
          ${contagemAnexos[e.id] ? `<span class="pill" style="background:var(--accent-soft);color:var(--accent)">${icone('paperclip', 12)} ${contagemAnexos[e.id]}</span>` : ''}
        </div>
        <div class="sub">${fmtData(e.data)}</div>
        <div class="sub" style="margin-top:2px">${renderTexto(e.resultadoResumo) || 'Aguardando resultado'}</div>
      </div>
    `;
  }

  // Planilha: uma linha por exame que já apareceu alguma vez (só os que têm
  // valor em pelo menos um dia — não os ~55 campos possíveis todos de uma
  // vez), uma coluna por dia. Rolagem horizontal com a coluna do nome fixa,
  // igual uma planilha de verdade rolando pros lados.
  const linhasComValor = LAB_FIELDS.filter((k) => labNumerico.some((e) => e.labsBasicos && e.labsBasicos[k] != null));
  const tabelaHtml = labNumerico.length ? `
    <div style="overflow-x:auto">
      <table class="tabela-labs">
        <thead>
          <tr>
            <th></th>
            ${labNumerico.map((e) => `<th class="tappable" onclick="nav('exame-ver/${e.id}')">${fmtData(e.data)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${linhasComValor.map((k) => `
            <tr>
              <td>${LAB_LABEL[k]}</td>
              ${labNumerico.map((e) => `<td>${e.labsBasicos && e.labsBasicos[k] != null ? e.labsBasicos[k] : '—'}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '<div class="empty">Nenhum exame laboratorial registrado.</div>';

  return `
    <div class="section-title">Exames laboratoriais</div>
    <button class="btn btn-secondary" onclick="nav('tendencia/${admission.id}')">Ver tendência</button>
    ${tabelaHtml}
    ${cultura.length ? `<div class="card" style="margin-top:10px">${cultura.map(linhaCultura).join('')}</div>` : ''}

    <div class="section-title">Exames de imagem</div>
    ${imagem.map(cartao).join('') || '<div class="empty">Nenhum exame de imagem registrado.</div>'}
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
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewExamDetail('${examId}'); })">${icone('pencil')} Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAttachment('${a.id}','${examId}')" aria-label="Remover foto" title="Remover">${icone('trash')}</button>
        </div>
      </div>
    `;
  }).join('');

  const labs = exame.labsBasicos || {};
  const labsHtml = LAB_FIELDS.filter((k) => labs[k] != null)
    .map((k) => `
      <span class="pill" style="background:var(--accent-soft);color:var(--accent);display:inline-flex;align-items:center;gap:4px">
        ${LAB_LABEL[k]}: ${labs[k]}
        <button class="icon-btn" style="width:auto;padding:0;font-size:12px" onclick="onRemoverLabExame('${examId}','${k}')" aria-label="Remover ${LAB_LABEL[k]}" title="Remover">${icone('trash', 12)}</button>
      </span>
    `).join(' ');
  const temTipo = exame.categoria === 'imagem' || exame.categoria === 'cultura';

  shell({
    title: temTipo && exame.tipo ? exame.tipo : fmtData(exame.data),
    back: admission ? `paciente/${admission.id}/exames` : '/',
    right: `<button class="icon-btn" onclick="onExcluirExame('${examId}','${exame.admissionId}')" title="Excluir exame" aria-label="Excluir exame">${icone('trash')}</button>`,
    body: `
      <label>Data</label>
      <input id="e-data-edit" type="date" value="${timestampParaInputISO(exame.data)}" oninput="salvarExameDebounced('${examId}')">
      ${temTipo ? `
        <label>Tipo</label>
        <input id="e-tipo-edit" type="text" value="${esc(exame.tipo || '')}" oninput="salvarExameDebounced('${examId}')">
      ` : ''}
      ${!temTipo ? `
        <label>Labs</label>
        <div class="card">
          ${labsHtml || '<div class="sub">Nenhum lab registrado ainda.</div>'}
          <div class="grid2" style="margin-top:10px">
            <input id="lab-edit-nome" type="text" placeholder="Ex.: Cr, K, Hb..." onkeydown="if(event.key==='Enter'){event.preventDefault();onAdicionarLabExame('${examId}')}">
            <input id="lab-edit-valor" type="text" inputmode="decimal" placeholder="Valor" onkeydown="if(event.key==='Enter'){event.preventDefault();onAdicionarLabExame('${examId}')}">
          </div>
          <button class="btn btn-secondary" style="margin-top:10px" onclick="onAdicionarLabExame('${examId}')">Adicionar</button>
        </div>
      ` : ''}
      <label style="margin-top:14px">${temTipo ? 'Resultado / laudo' : 'Resumo / demais exames'}</label>
      <textarea id="e-resumo-edit" oninput="salvarExameDebounced('${examId}')" placeholder="Envolva um trecho com ==assim== pra destacar">${esc(exame.resultadoResumo || '')}</textarea>
      <div id="exame-status" class="sub" style="text-align:right;margin-top:4px">${exame.resultadoResumo || Object.keys(labs).length ? 'Salvo' : ''}</div>

      <div class="section-title">Fotos / laudo</div>
      <div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
        ${thumbs}
      </div>
      <label style="margin-top:14px">Anexar foto (câmera ou galeria)</label>
      <input type="file" accept="image/*" multiple onchange="onAddAttachment('${examId}', this.files)">
      <button class="btn btn-secondary" onclick="onEscreverAmaoExame('${examId}')">${icone('pencil')} Escrever à mão</button>
    `,
  });
}

// Sem botão "Salvar": data/tipo/resumo do exame gravam sozinhos 600ms
// depois de parar de digitar — mesmo esquema de HDA/Prescrições/Notepad.
let debounceSalvarExame = null;
function salvarExameDebounced(examId) {
  const statusEl = document.getElementById('exame-status');
  if (statusEl) statusEl.textContent = 'Salvando…';
  clearTimeout(debounceSalvarExame);
  debounceSalvarExame = setTimeout(async () => {
    const exame = await DB.get('exams', examId);
    exame.data = dataLocalDeInput(document.getElementById('e-data-edit').value);
    const tipoEl = document.getElementById('e-tipo-edit');
    if (tipoEl) exame.tipo = tipoEl.value.trim();
    exame.resultadoResumo = document.getElementById('e-resumo-edit').value.trim();
    await DB.put('exams', exame);
    const statusAtual = document.getElementById('exame-status');
    if (statusAtual) statusAtual.textContent = `Salvo às ${fmtData(Date.now(), true).split(' ')[1]}`;
  }, 600);
}

// Labs individuais do exame já salvo gravam na hora (não têm rascunho —
// reaproveita o mesmo resolverLabPorApelido do fluxo de criação).
async function onAdicionarLabExame(examId) {
  const nomeEl = document.getElementById('lab-edit-nome');
  const valorEl = document.getElementById('lab-edit-valor');
  const nome = nomeEl.value.trim();
  const valorTexto = valorEl.value.trim();
  if (!nome || !valorTexto) return;
  const resolvido = resolverLabPorApelido(nome);
  if (!resolvido) {
    Dialog.avisar(`Lab "${nome}" não reconhecido — tente a sigla usual (Cr, K, Hb...) ou o nome completo.`, { tipo: 'erro' });
    return;
  }
  const valor = Number(valorTexto.replace(',', '.'));
  if (Number.isNaN(valor)) {
    Dialog.avisar('O valor precisa ser um número.', { tipo: 'erro' });
    return;
  }
  const exame = await DB.get('exams', examId);
  exame.labsBasicos = { ...(exame.labsBasicos || {}), [resolvido.key]: valor };
  await DB.put('exams', exame);
  viewExamDetail(examId);
}
async function onRemoverLabExame(examId, key) {
  const exame = await DB.get('exams', examId);
  delete exame.labsBasicos[key];
  await DB.put('exams', exame);
  viewExamDetail(examId);
}

// "Excluir" aqui é de vez — some o exame e as fotos ligadas a ele, por
// isso o confirm antes (mesmo padrão de onExcluirAdmissao).
async function onExcluirExame(examId, admissionId) {
  const ok = await Dialog.confirmar({
    titulo: 'Excluir exame?',
    mensagem: 'O exame e as fotos anexadas a ele serão perdidos para sempre — sem volta.',
    textoConfirmar: 'Excluir de vez',
    perigoso: true,
  });
  if (!ok) return;
  const anexos = await DB.where('attachments', (a) => a.examId === examId);
  for (const a of anexos) await DB.remove('attachments', a.id);
  await DB.remove('exams', examId);
  nav(`paciente/${admissionId}/exames`);
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

// Agrupa uma lista já ordenada (mais recente primeiro) em blocos por dia
// corrido, sem reordenar nada — só detecta onde o dia muda em
// `fmtData(item.criadoEm)` e quebra ali. Reutilizável em qualquer lista com
// `criadoEm`.
function agruparPorDia(itens, campoData = 'criadoEm') {
  const grupos = [];
  let diaAtual = null;
  for (const item of itens) {
    const dia = fmtData(item[campoData]);
    if (dia !== diaAtual) {
      grupos.push({ dia, itens: [] });
      diaAtual = dia;
    }
    grupos[grupos.length - 1].itens.push(item);
  }
  return grupos;
}
function htmlCabecalhoDia(dia, primeiro) {
  return `<div style="font-size:12px;font-weight:700;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.5px;${primeiro ? '' : 'margin-top:12px;padding-top:10px;border-top:1px solid var(--hairline);'}">${esc(dia)}</div>`;
}

async function tabPlanos(admission) {
  const todos = (await DB.where('planItems', (p) => p.admissionId === admission.id))
    .sort((a, b) => b.criadoEm - a.criadoEm);

  function secaoPlano({ key, label, placeholder }) {
    // planos antigos (de antes dessa separação) não têm `categoria` — tratados
    // como "residente", que era o único tipo que existia até então.
    const itens = todos.filter((p) => (p.categoria || 'residente') === key);
    const grupos = agruparPorDia(itens);
    return `
      <div class="section-title">${label}</div>
      <div class="card">
        ${grupos.map((g, i) => `
          ${htmlCabecalhoDia(g.dia, i === 0)}
          ${g.itens.map((p) => `
            <div class="list-item row" onclick="togglePlano('${p.id}')" style="cursor:pointer">
              <span class="${p.concluido ? 'strike' : ''}">${p.concluido ? icone('square-check') : icone('square')} ${renderTexto(p.descricao)}</span>
            </div>
          `).join('')}
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
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','prescricoes'); })">${icone('pencil')} Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoPrescricao('${a.id}','${admission.id}')" aria-label="Remover foto" title="Remover">${icone('trash')}</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:14px">
      ${thumbs || '<div class="empty">Nenhuma foto de prescrição ainda.</div>'}
    </div>
    <div class="row">
      <label style="margin:0">Adicionar foto (câmera ou galeria)</label>
      <button class="icon-btn" style="width:auto" onclick="onEscreverAmaoPrescricao('${admission.id}')" aria-label="Escrever com a Pencil" title="Escrever com a Pencil">${icone('pencil')}</button>
    </div>
    <input type="file" accept="image/*" multiple onchange="onAddPrescricaoFoto('${admission.id}', this.files)">

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
          ${a.tracos ? `<button class="btn btn-ghost" style="width:auto" onclick="onEditarAnotacao('${a.id}', function(){ viewPatientDetail('${admission.id}','evolucoes'); })">${icone('pencil')} Editar</button>` : '<span></span>'}
          <button class="btn btn-ghost" style="width:auto" onclick="onDeleteAnexoEvolucao('${a.id}','${admission.id}')" aria-label="Remover" title="Remover">${icone('trash')}</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <textarea id="edit-evolucao" oninput="onDigitarNotepad(this,'${admission.id}')" placeholder="Escreva aqui. Toque no microfone do teclado pra ditar. Envolva um trecho com ==assim== pra destacar. Valores de lab escritos aqui (ex.: K 4,0 Cl 105 Hb 12) vão sozinhos pra aba Exames conforme você for digitando." style="min-height:420px">${esc(admission.evolucaoTexto || '')}</textarea>
    <div id="notepad-status" class="sub" style="text-align:right;margin-top:4px">${admission.evolucaoTexto ? 'Salvo' : ''}</div>

    <label style="margin-top:14px">Anexar laudo de exame de imagem (câmera ou galeria)</label>
    <input type="file" accept="image/*" multiple onchange="onAnexarLaudoImagem('${admission.id}', this.files)">

    <div class="row" style="margin:14px 0 6px">
      <div class="section-title" style="margin:0">Anotações à mão</div>
      <button class="icon-btn" style="width:auto" onclick="onEscreverAmaoEvolucao('${admission.id}')" aria-label="Escrever com a Pencil" title="Escrever com a Pencil">${icone('pencil')}</button>
    </div>
    ${thumbs ? `<div class="wf-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:10px">${thumbs}</div>` : ''}
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
// Apelidos que não seriam achados sozinhos pelo prefixo do nome completo em
// LAB_LABEL (ver resolverLabPorApelido) — o resto dos ~50 exames é
// encontrado só por prefixo, sem precisar de entrada aqui.
const LAB_TOKEN_MAP = {
  Hb: 'hb', Ht: 'ht', VCM: 'vcm', CHCM: 'chcm', Plaq: 'plaq',
  Leucócitos: 'leuco', Leucocitos: 'leuco', Leuco: 'leuco',
  PCR: 'pcr', Ureia: 'ureia', Uréia: 'ureia', Creat: 'creat', Cr: 'creat',
  Na: 'na', K: 'k', Cl: 'cl',
  AST: 'tgo', ALT: 'tgp', Bicarbonato: 'hco3', Glicose: 'glicemia', iCa: 'ica',
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

// Separa um texto livre tipo "120x80" / "120/80" em dois números — é o que
// interpreta o campo único de PA na aba Sinais Vitais (v-pa), e também
// resgata registros bem antigos que só tinham esse texto livre guardado
// (de antes de PA virar dois campos próprios). Quando não dá pra separar,
// sobra null nos dois.
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
    <input id="v-pa" type="text" placeholder="PA (ex.: 120x70)">
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
  const paTexto = document.getElementById('v-pa').value.trim();
  const { sistolica: paSist, diastolica: paDiast } = parsePA(paTexto);
  if (paTexto && paSist == null) {
    Dialog.avisar('PA não reconhecida — use o formato 120x70.', { tipo: 'erro' });
    return;
  }
  const fc = document.getElementById('v-fc').value;
  const sato2 = document.getElementById('v-sato2').value;
  const tax = document.getElementById('v-tax').value.trim();
  if (paSist == null && fc === '' && sato2 === '' && !tax) return;
  await DB.put('vitalSigns', {
    id: newId(), admissionId, createdAt: Date.now(),
    paSistolica: paSist,
    paDiastolica: paDiast,
    fc: fc !== '' ? Number(fc) : null,
    sato2: sato2 !== '' ? Number(sato2) : null,
    tax: tax || null,
  });
  viewPatientDetail(admissionId, 'vitais');
}

// ---------- novo exame ----------

const LAB_FIELDS = [
  // "p" (Fósforo) precisa vir antes de "plaq" nesta lista — resolverLabPorApelido
  // resolve pelo primeiro nome que comece com o que foi digitado, e "P" sozinho
  // é o apelido clínico real de Fósforo (ninguém abrevia Plaquetas pra "P").
  'p',
  // Hemograma
  'hb', 'ht', 'vcm', 'hcm', 'chcm', 'rdw', 'leuco',
  'bast', 'segm', 'linf', 'mono', 'eosino', 'plaq',
  // Coagulação
  'inr', 'ttpa', 'fibrinogenio',
  // Renal / eletrólitos
  'ureia', 'creat', 'acidourico', 'na', 'k', 'cl', 'ca', 'ica', 'mg', 'ra',
  // Hepatograma
  'tgo', 'tgp', 'fa', 'ggt', 'bt', 'bd', 'bi', 'alb', 'pt',
  // Inflamatórios/infecciosos
  'pcr', 'vhs', 'pct',
  // Endócrino/metabólico
  'glicemia', 'hba1c', 'tsh', 't4l',
  // Cardíaco
  'tropo', 'ck', 'ckmb', 'bnp',
  // Gasometria (venosa ou arterial — mesmos campos servem pras duas)
  'ph', 'pco2', 'po2', 'hco3', 'be', 'lactato', 'sato2gaso',
  // Urológico
  'psat', 'psal',
];
const LAB_LABEL = {
  hb: 'Hb', ht: 'Ht', vcm: 'VCM', hcm: 'HCM', chcm: 'CHCM', rdw: 'RDW', plaq: 'Plaq', leuco: 'Leucócitos',
  bast: 'Bastões', segm: 'Segmentados', linf: 'Linfócitos', mono: 'Monócitos', eosino: 'Eosinófilos',
  inr: 'INR', ttpa: 'TTPA', fibrinogenio: 'Fibrinogênio',
  ureia: 'Ureia', creat: 'Creatinina', acidourico: 'Ácido Úrico', na: 'Na', k: 'K', cl: 'Cl',
  ca: 'Ca', ica: 'Ca iônico', mg: 'Mg', p: 'P', ra: 'RA (Reserva Alcalina)',
  tgo: 'TGO/AST', tgp: 'TGP/ALT', fa: 'FA', ggt: 'GGT', bt: 'BT', bd: 'BD', bi: 'BI', alb: 'Albumina', pt: 'Proteínas totais',
  pcr: 'PCR', vhs: 'VHS', pct: 'Procalcitonina',
  glicemia: 'Glicemia', hba1c: 'HbA1c', tsh: 'TSH', t4l: 'T4 livre',
  tropo: 'Troponina', ck: 'CK', ckmb: 'CKMB', bnp: 'BNP',
  ph: 'pH', pco2: 'pCO2', po2: 'pO2', hco3: 'HCO3', be: 'BE', lactato: 'Lactato', sato2gaso: 'SatO2 (gaso)',
  psat: 'PSA total', psal: 'PSA livre',
};

// Busca inteligente do nome do lab: "Cr" ou "creat" acham Creatinina, "K"
// acha Potássio etc. Reaproveita o MESMO dicionário de apelidos que já
// existia pra extrair labs digitados no Bloco de Notas (LAB_TOKEN_MAP), só
// que aqui aceita também prefixo (não precisa ser o apelido exato) e cai
// por último pro nome completo do exame.
function normalizarLabApelido(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
function resolverLabPorApelido(texto) {
  const alvo = normalizarLabApelido(texto);
  if (!alvo) return null;
  // 1) apelido clínico exato (Cr, K, AST, Leuco, Uréia, Bicarbonato...).
  for (const [apelido, key] of Object.entries(LAB_TOKEN_MAP)) {
    if (normalizarLabApelido(apelido) === alvo) return { key, label: LAB_LABEL[key] };
  }
  // 2) o NOME DO EXAME começa com o que foi digitado — nunca o contrário.
  // Checar se um apelido comprido começa com a sigla curta digitada (ex.:
  // "BI" batendo em "Bicarbonato", ou "P" em "Plaq") dá falso positivo
  // toda hora; só essa direção é segura.
  for (const key of LAB_FIELDS) {
    if (normalizarLabApelido(LAB_LABEL[key]).startsWith(alvo)) return { key, label: LAB_LABEL[key] };
  }
  return null;
}

// Rascunho dos labs da ficha de "Novo exame" — começa em branco (nada de
// grade fixa com os 12 campos sempre visíveis) e cresce numa coluna
// vertical conforme cada um é adicionado. Vive só na memória até salvar,
// igual ao resto desse formulário (é criação de registro, não edição).
let labsRascunho = [];
function htmlListaLabsRascunho() {
  return labsRascunho.map((l, i) => `
    <div class="list-item row">
      <span>${esc(l.label)}: ${esc(l.valor)}</span>
      <button class="btn btn-ghost" style="width:auto;margin-top:0;padding:6px 8px" onclick="onRemoverLabRascunho(${i})" aria-label="Remover" title="Remover">${icone('trash')}</button>
    </div>
  `).join('') || '<div class="list-item">Nenhum lab adicionado ainda.</div>';
}
function onRemoverLabRascunho(indice) {
  labsRascunho.splice(indice, 1);
  document.getElementById('labs-rascunho-lista').innerHTML = htmlListaLabsRascunho();
}
function onAdicionarLabRascunho() {
  const nomeEl = document.getElementById('lab-nome');
  const valorEl = document.getElementById('lab-valor');
  const nome = nomeEl.value.trim();
  const valorTexto = valorEl.value.trim();
  if (!nome || !valorTexto) return;
  const resolvido = resolverLabPorApelido(nome);
  if (!resolvido) {
    Dialog.avisar(`Lab "${nome}" não reconhecido — tente a sigla usual (Cr, K, Hb...) ou o nome completo.`, { tipo: 'erro' });
    return;
  }
  const valor = Number(valorTexto.replace(',', '.'));
  if (Number.isNaN(valor)) {
    Dialog.avisar('O valor precisa ser um número.', { tipo: 'erro' });
    return;
  }
  labsRascunho = labsRascunho.filter((l) => l.key !== resolvido.key);
  labsRascunho.push({ key: resolvido.key, label: resolvido.label, valor });
  nomeEl.value = '';
  valorEl.value = '';
  nomeEl.focus();
  document.getElementById('labs-rascunho-lista').innerHTML = htmlListaLabsRascunho();
}

function viewNewExam(admissionId, categoria = 'lab') {
  labsRascunho = [];
  const camposLab = `
    <div class="section-title">Labs rápidos</div>
    <div class="card">
      <div id="labs-rascunho-lista">${htmlListaLabsRascunho()}</div>
      <div class="grid2" style="margin-top:10px">
        <input id="lab-nome" type="text" placeholder="Ex.: Cr, K, Hb..." onkeydown="if(event.key==='Enter'){event.preventDefault();onAdicionarLabRascunho()}">
        <input id="lab-valor" type="text" inputmode="decimal" placeholder="Valor" onkeydown="if(event.key==='Enter'){event.preventDefault();onAdicionarLabRascunho()}">
      </div>
      <button class="btn btn-secondary" style="margin-top:10px" onclick="onAdicionarLabRascunho()">Adicionar</button>
    </div>
    <label style="margin-top:14px">Resumo / demais exames</label>
    <textarea id="e-resumo" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
  `;
  const camposImagem = `
    <label>Tipo de exame</label>
    <input id="e-tipo" type="text" placeholder="Ex.: TC de crânio, RM de coluna lombar">
    <label>Achados / laudo</label>
    <textarea id="e-resumo" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
  `;
  const camposCultura = `
    <label>Tipo de cultura</label>
    <input id="e-tipo" type="text" placeholder="Ex.: Hemocultura, Urocultura, Cultura de secreção...">
    <label>Resultado / antibiograma</label>
    <textarea id="e-resumo" placeholder="Envolva um trecho com ==assim== pra destacar"></textarea>
  `;
  shell({
    title: 'Exame', back: `paciente/${admissionId}/exames`,
    body: `
      <div class="tabs">
        <button class="${categoria === 'lab' ? 'active' : ''}" onclick="nav('exame/${admissionId}/lab')">Laboratorial</button>
        <button class="${categoria === 'imagem' ? 'active' : ''}" onclick="nav('exame/${admissionId}/imagem')">Imagem</button>
        <button class="${categoria === 'cultura' ? 'active' : ''}" onclick="nav('exame/${admissionId}/cultura')">Culturas</button>
      </div>
      <label>Data</label>
      <input id="e-data" type="date" value="${hojeLocalISO()}">
      ${categoria === 'imagem' ? camposImagem : categoria === 'cultura' ? camposCultura : camposLab}
      <label style="margin-top:14px">Fotos do laudo (opcional — pode tirar agora, antes de escrever qualquer coisa)</label>
      <input type="file" id="e-fotos" accept="image/*" multiple>
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
  if (categoria === 'imagem' || categoria === 'cultura') {
    exame.tipo = document.getElementById('e-tipo').value.trim();
  } else {
    for (const l of labsRascunho) exame.labsBasicos[l.key] = l.valor;
  }
  await DB.put('exams', exame);
  for (const file of document.getElementById('e-fotos').files) {
    const id = newId();
    const storagePath = await subirAnexo(id, file);
    await DB.put('attachments', { id, examId: exame.id, tipo: file.type, storagePath, criadoEm: Date.now() });
  }
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
        <button class="icon-btn" onclick="viewReport(${mes === 0 ? ano - 1 : ano}, ${mes === 0 ? 11 : mes - 1})" title="Mês anterior" aria-label="Mês anterior">${icone('chevron-left')}</button>
        <strong>${nomeMes}</strong>
        <button class="icon-btn" onclick="viewReport(${mes === 11 ? ano + 1 : ano}, ${mes === 11 ? 0 : mes + 1})" title="Próximo mês" aria-label="Próximo mês">${icone('chevron-right')}</button>
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

// ---------- pendências do dia ----------

// Reúne, de todos os pacientes ativos, o que ainda falta HOJE: planos não
// concluídos (de qualquer categoria/data — um plano aberto continua
// pendente até ser marcado, não só no dia em que foi criado) e a prescrição
// do dia ainda não marcada (esse sim é por data, mesmo esquema do
// quadradinho na lista de pacientes). Paciente sem pendência nenhuma nem
// aparece — é uma lista do que falta, não um resumo de todo mundo.
// Marcar qualquer item aqui reaproveita exatamente as mesmas funções da
// ficha do paciente (togglePlano, onTogglePrescricaoCheck), que já
// re-renderizam a rota atual sozinhas.
async function viewPendencias() {
  const admissoes = (await DB.where('admissions', (a) => a.status === 'ativo'))
    .sort((a, b) => (a.leito || '').localeCompare(b.leito || ''));
  const patients = Object.fromEntries((await DB.all('patients')).map((p) => [p.id, p]));
  const hoje = hojeLocalISO();

  const secoes = (await Promise.all(admissoes.map(async (a) => {
    const planos = (await DB.where('planItems', (p) => p.admissionId === a.id && !p.concluido))
      .sort((x, y) => x.criadoEm - y.criadoEm);
    const prescricaoPendente = a.prescricaoCheckDia !== hoje;
    if (!planos.length && !prescricaoPendente) return '';

    const p = patients[a.patientId] || {};
    const itemPrescricao = prescricaoPendente ? `
      <div class="list-item row" onclick="onTogglePrescricaoCheck('${a.id}')" style="cursor:pointer">
        <span>${icone('square')} Prescrição de hoje</span>
      </div>
    ` : '';
    const itensPlano = planos.map((pl) => `
      <div class="list-item row" onclick="togglePlano('${pl.id}')" style="cursor:pointer">
        <span>${icone('square')} ${renderTexto(pl.descricao)}</span>
      </div>
    `).join('');

    return `
      <div class="card">
        <div class="row tappable" onclick="nav('paciente/${a.id}')">
          <span class="leito">${esc(a.leito)}</span>
          <span class="sub">${esc(p.nomeCompleto || p.iniciais || '')}</span>
        </div>
        ${itemPrescricao}${itensPlano}
      </div>
    `;
  }))).filter(Boolean);

  shell({
    title: 'Pendências', back: '/',
    body: secoes.join('') || '<div class="empty">Tudo em dia — nenhuma pendência hoje.</div>',
  });
}

boot();
