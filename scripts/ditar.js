#!/usr/bin/env node
// Ditado (por leito) → Wards, sem passar pelo app. Pensado pra ser chamado
// pelo Claude no meio de uma conversa: o Claude já organiza/limpa o texto
// ditado e decide os números antes de chamar isto — este script só localiza
// a internação certa pelo leito e escreve no campo/store certo, do mesmo
// jeito que o app faria.
//
// Uso (texto livre — hda, evolucao, prescricao, motivo):
//   node scripts/ditar.js --code <codigo> --leito "302-B" --aba evolucao --texto "..."
//
// Uso (sinais vitais — cria um registro novo, como o botão "Adicionar" da aba):
//   node scripts/ditar.js --code <codigo> --leito "302-B" --aba sinaisvitais --fc 80 --sato2 96 --pa "120x80" --tax 36.5
//
// Uso (exame laboratorial — mescla no exame de HOJE já existente, como a
// extração automática de labs da Evolução faz; cria um novo se não houver):
//   node scripts/ditar.js --code <codigo> --leito "302-B" --aba exame --creat 5 --ureia 42 --na 138
//   (campos aceitos: hb, ht, vcm, chcm, plaq, leuco, pcr, ureia, creat, na, k, cl; --resumo opcional)
//
// Risco a saber: isto busca a nuvem, muda só a internação/registro alvo e
// manda de volta — como o app inteiro, não faz merge fino por campo (ver
// js/backup.js). Se o mesmo paciente tiver uma edição local ainda não
// sincronizada em algum aparelho na hora em que isto rodar, aquela edição
// local pode ser perdida quando o aparelho sincronizar depois. Seguro na
// prática porque a janela é curta (edição só vira "não sincronizada" entre
// digitar e apertar Salvar), mas não é zero.

const URL_SYNC = 'https://wards-app.vercel.app/api/sync';

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

// Mesma data (sem hora) pra decidir se um exame de labs é "de hoje" — bate
// com fmtData(x) do app (toLocaleDateString('pt-BR')), sem precisar do app.
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

function acharAdmissao(dump, leitoAlvo) {
  const admissoes = (dump.stores && dump.stores.admissions) || [];
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
  return candidatas[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const codigo = args.code || process.env.WARDS_SYNC_CODE;
  const leitoAlvo = args.leito;
  const abaAlvo = normalizar(args.aba);

  if (!codigo || !leitoAlvo || !abaAlvo) {
    console.error('uso: node ditar.js --code <codigo> --leito "302-B" --aba <hda|evolucao|prescricao|motivo|sinaisvitais|exame> [...]');
    process.exit(1);
  }

  const respGet = await fetch(`${URL_SYNC}?code=${encodeURIComponent(codigo)}`);
  if (!respGet.ok) { console.error('falha ao buscar da nuvem:', respGet.status); process.exit(1); }
  const dump = await respGet.json();
  dump.stores = dump.stores || {};

  const admissao = acharAdmissao(dump, leitoAlvo);
  const pacientes = dump.stores.patients || [];
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
    dump.stores.vitalSigns = dump.stores.vitalSigns || [];
    dump.stores.vitalSigns.push(registro);
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
    dump.stores.exams = dump.stores.exams || [];
    const hoje = Date.now();
    let exame = dump.stores.exams.find((e) => e.admissionId === admissao.id && e.categoria !== 'imagem' && mesmaData(e.data, hoje));
    if (!exame) {
      exame = { id: crypto.randomUUID(), admissionId: admissao.id, categoria: 'lab', data: hoje, resultadoResumo: '', labsBasicos: {} };
      dump.stores.exams.push(exame);
    }
    exame.labsBasicos = { ...(exame.labsBasicos || {}), ...achados };
    if (args.resumo) exame.resultadoResumo = `${exame.resultadoResumo ? exame.resultadoResumo + '\n\n' : ''}${args.resumo}`;
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
    resumoSaida = admissao[campo];
  }

  const respPost = await fetch(`${URL_SYNC}?code=${encodeURIComponent(codigo)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dump),
  });
  if (!respPost.ok) { console.error('falha ao enviar pra nuvem:', respPost.status); process.exit(1); }

  console.log(`OK — ${admissao.leito} (${nomePaciente}), aba "${args.aba}" atualizada.`);
  console.log('---');
  console.log(resumoSaida);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
