#!/usr/bin/env node
// Ditado (por leito) → Wards, sem passar pelo app. Pensado pra ser chamado
// pelo Claude no meio de uma conversa: o Claude já organiza/limpa o texto
// ditado e decide os números antes de chamar isto — este script só localiza
// a internação certa pelo leito e escreve no campo/tabela certa, do mesmo
// jeito que o app faria.
//
// Fala direto com a API REST do Supabase via fetch puro (sem instalar
// @supabase/supabase-js) — mesma filosofia de zero dependência do resto do
// projeto. Autentica como o usuário de verdade (e-mail+senha), então tudo
// que grava cai sob a conta dele via Row Level Security — não precisa (nem
// deve) da chave de serviço aqui.
//
// Uso (texto livre — hda, evolucao, prescricao, motivo):
//   node scripts/ditar.js --email "voce@x.com" --senha "..." --leito "302-B" --aba evolucao --texto "..."
//   (ou WARDS_EMAIL / WARDS_SENHA como variável de ambiente, em vez de --email/--senha)
//
// Uso (sinais vitais — cria um registro novo, como o botão "Adicionar" da aba):
//   node scripts/ditar.js --email ... --senha ... --leito "302-B" --aba sinaisvitais --fc 80 --sato2 96 --pa "120x80" --tax 36.5
//
// Uso (exame laboratorial — mescla no exame de HOJE já existente, como a
// extração automática de labs da Evolução faz; cria um novo se não houver):
//   node scripts/ditar.js --email ... --senha ... --leito "302-B" --aba exame --creat 5 --ureia 42 --na 138
//   (campos aceitos: hb, ht, vcm, chcm, plaq, leuco, pcr, ureia, creat, na, k, cl; --resumo opcional)
//
// Diferente da versão antiga (que reescrevia um blob JSON inteiro): cada
// gravação aqui é um upsert de UMA linha na tabela certa, direto no
// Postgres — não existe mais o risco de "duas cópias divergentes"
// (era um problema do modelo antigo de sincronização por código, que não
// existe mais nesta versão multiusuário).

const SUPABASE_URL = 'https://jmaeqnpdnllachqvhibk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYWVxbnBkbmxsYWNocXZoaWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MzUxNDcsImV4cCI6MjEwNTAxMTE0N30.hPYo_PtRX8AaqLnxCh7AlXV6u6ZU737MG4gZZeLLBrE';

const CAMPO_TEXTO_POR_ABA = {
  hda: 'hda',
  evolucao: 'evolucaoTexto',
  prescricao: 'prescricaoObs',
  motivo: 'motivoAdmissao',
};

const ABAS_VITAIS = ['sinaisvitais', 'sinais', 'vitais'];
const ABAS_EXAME = ['exame', 'exames', 'labs', 'lab'];

const LAB_FIELDS = ['hb', 'ht', 'vcm', 'chcm', 'plaq', 'leuco', 'pcr', 'ureia', 'creat', 'na', 'k', 'cl'];

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function formatarDataHora(d = new Date()) {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()} ${hh}:${mm}`;
}

// Mesma data (sem hora) pra decidir se um exame de labs é "de hoje".
function mesmaData(a, b) {
  const da = new Date(a), db_ = new Date(b);
  return da.getFullYear() === db_.getFullYear() && da.getMonth() === db_.getMonth() && da.getDate() === db_.getDate();
}

function parsePA(texto) {
  if (!texto) return { sistolica: null, diastolica: null };
  const m = String(texto).match(/(\d+)\s*[x×/]\s*(\d+)/i);
  if (!m) return { sistolica: null, diastolica: null };
  return { sistolica: Number(m[1]), diastolica: Number(m[2]) };
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1]; i++; }
  }
  return out;
}

async function autenticar(email, senha) {
  const resp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password: senha }),
  });
  const corpo = await resp.json();
  if (!resp.ok) throw new Error(`login falhou: ${corpo.error_description || corpo.msg || resp.status}`);
  return corpo.access_token;
}

function headersAutenticados(token) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function buscarTabela(token, tabela) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=data`, { headers: headersAutenticados(token) });
  if (!resp.ok) throw new Error(`falha ao buscar ${tabela}: ${resp.status} ${await resp.text()}`);
  const linhas = await resp.json();
  return linhas.map((l) => l.data);
}

async function upsert(token, tabela, obj) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: 'POST',
    headers: { ...headersAutenticados(token), Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: obj.id, data: obj }),
  });
  if (!resp.ok) throw new Error(`falha ao gravar em ${tabela}: ${resp.status} ${await resp.text()}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email || process.env.WARDS_EMAIL;
  const senha = args.senha || args.password || process.env.WARDS_SENHA;
  const leitoAlvo = args.leito;
  const abaAlvo = normalizar(args.aba);

  if (!email || !senha || !leitoAlvo || !abaAlvo) {
    console.error('uso: node ditar.js --email <email> --senha <senha> --leito "302-B" --aba <hda|evolucao|prescricao|motivo|sinaisvitais|exame> [...]');
    process.exit(1);
  }

  const token = await autenticar(email, senha);

  const admissoes = await buscarTabela(token, 'admissions');
  const alvoNorm = normalizar(leitoAlvo);
  const candidatas = admissoes.filter((a) => a.status === 'ativo' && normalizar(a.leito).includes(alvoNorm));
  if (candidatas.length === 0) {
    console.error(`nenhuma internação ativa com leito "${leitoAlvo}" encontrada.`);
    process.exit(1);
  }
  if (candidatas.length > 1) {
    console.error(`mais de um leito ativo bate com "${leitoAlvo}": ${candidatas.map((a) => a.leito).join(', ')} — seja mais específico.`);
    process.exit(1);
  }
  const admissao = candidatas[0];

  const pacientes = await buscarTabela(token, 'patients');
  const paciente = pacientes.find((p) => p.id === admissao.patientId);
  const nomePaciente = paciente ? (paciente.nomeCompleto || paciente.iniciais) : '?';
  let resumoSaida = '';

  if (ABAS_VITAIS.includes(abaAlvo)) {
    const { sistolica, diastolica } = parsePA(args.pa);
    const registro = {
      id: crypto.randomUUID(), admissionId: admissao.id, createdAt: Date.now(),
      paSistolica: sistolica, paDiastolica: diastolica,
      fc: args.fc !== undefined ? Number(args.fc) : null,
      sato2: args.sato2 !== undefined ? Number(args.sato2) : null,
      tax: args.tax || null,
    };
    if (registro.paSistolica == null && registro.fc == null && registro.sato2 == null && !registro.tax) {
      console.error('nenhum sinal vital informado (--fc, --sato2, --pa, --tax).');
      process.exit(1);
    }
    await upsert(token, 'vitalSigns', registro);
    resumoSaida = `PA ${registro.paSistolica ?? '?'}/${registro.paDiastolica ?? '?'} | FC ${registro.fc ?? '—'} | SatO2 ${registro.sato2 ?? '—'} | Tax ${registro.tax ?? '—'}`;
  } else if (ABAS_EXAME.includes(abaAlvo)) {
    const achados = {};
    for (const k of LAB_FIELDS) {
      if (args[k] !== undefined) achados[k] = Number(args[k]);
    }
    if (!Object.keys(achados).length && !args.resumo) {
      console.error(`nenhum lab informado. campos aceitos: ${LAB_FIELDS.join(', ')} (ou --resumo).`);
      process.exit(1);
    }
    const exames = await buscarTabela(token, 'exams');
    const hoje = Date.now();
    let exame = exames.find((e) => e.admissionId === admissao.id && e.categoria !== 'imagem' && mesmaData(e.data, hoje));
    if (!exame) {
      exame = { id: crypto.randomUUID(), admissionId: admissao.id, categoria: 'lab', data: hoje, resultadoResumo: '', labsBasicos: {} };
    }
    exame.labsBasicos = { ...(exame.labsBasicos || {}), ...achados };
    if (args.resumo) exame.resultadoResumo = `${exame.resultadoResumo ? exame.resultadoResumo + '\n\n' : ''}${args.resumo}`;
    await upsert(token, 'exams', exame);
    resumoSaida = JSON.stringify(exame.labsBasicos);
  } else {
    const campo = CAMPO_TEXTO_POR_ABA[abaAlvo];
    if (!campo) {
      console.error(`aba desconhecida: "${args.aba}". opções: ${[...Object.keys(CAMPO_TEXTO_POR_ABA), ...ABAS_VITAIS, ...ABAS_EXAME].join(', ')}`);
      process.exit(1);
    }
    if (!args.texto) { console.error('--texto é obrigatório pra essa aba.'); process.exit(1); }
    if (campo === 'evolucaoTexto') {
      const atual = admissao.evolucaoTexto || '';
      admissao.evolucaoTexto = `${atual}${atual ? '\n\n' : ''}[${formatarDataHora()}]\n${args.texto}`;
    } else if (campo === 'motivoAdmissao') {
      admissao.motivoAdmissao = args.texto;
    } else {
      const atual = admissao[campo] || '';
      admissao[campo] = `${atual}${atual ? '\n\n' : ''}${args.texto}`;
    }
    await upsert(token, 'admissions', admissao);
    resumoSaida = admissao[campo];
  }

  console.log(`OK — ${admissao.leito} (${nomePaciente}), aba "${args.aba}" atualizada.`);
  console.log('---');
  console.log(resumoSaida);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
