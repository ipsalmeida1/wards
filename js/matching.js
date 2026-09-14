// Casamento automático de categoria de diagnóstico — trigramas, limiar 0,6.
// Só olha pra Problema.texto e pra HD final da alta, nunca HDA/motivo/
// comorbidades.
//
// 0,6 veio de medir pares reais: "AVC isquêmico" vs "AVC isquêmico agudo"
// dá 0,647 (devem juntar); "Insuficiência cardíaca" vs "Insuficiência renal"
// dá 0,48 (não devem) — 0,6 fica no meio, capturando variação por palavra a
// mais/a menos sem juntar diagnósticos diferentes que só compartilham um
// prefixo. O limiar anterior (0,9) só juntava strings praticamente idênticas.
//
// O que trigrama NUNCA resolve: abreviação vs. nome por extenso (“AVCi” vs
// “AVC isquêmico” dá 0,083 — praticamente zero, não tem limiar que ajude
// nisso). Pra esse caso existe "renomear categoria" no Relatório mensal:
// como o relatório já agrupa pelo nome resolvido da categoria, renomear uma
// categoria pro mesmo nome de outra as junta ali, sem precisar reatribuir
// nada admissão por admissão.
const Matching = {
  limiar: 0.6,

  normalizar(texto) {
    return texto
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
      .trim();
  },

  trigramas(s) {
    if (s.length < 3) return s ? new Set([s]) : new Set();
    const out = new Set();
    for (let i = 0; i <= s.length - 3; i++) out.add(s.slice(i, i + 3));
    return out;
  },

  similaridade(a, b) {
    const ta = Matching.trigramas(a);
    const tb = Matching.trigramas(b);
    const uniao = new Set([...ta, ...tb]);
    if (uniao.size === 0) return a === b ? 1 : 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter++;
    return inter / uniao.size;
  },

  // Busca a categoria mais parecida entre as existentes; cria uma nova se
  // nada bater o limiar. Retorna a categoria (persistida no IndexedDB).
  async resolverCategoria(textoDigitado) {
    const alvo = Matching.normalizar(textoDigitado);
    const existentes = await WardsDB.Store.all('diagnosisCategories');

    let melhor = null, melhorScore = -1;
    for (const cat of existentes) {
      const score = Matching.similaridade(cat.nomeNormalizado, alvo);
      if (score > melhorScore) { melhor = cat; melhorScore = score; }
    }

    if (melhor && melhorScore >= Matching.limiar) return melhor;

    const nova = {
      id: WardsDB.uuid(),
      nome: textoDigitado,
      nomeNormalizado: alvo,
    };
    await WardsDB.Store.put('diagnosisCategories', nova);
    return nova;
  },
};

window.Matching = Matching;
