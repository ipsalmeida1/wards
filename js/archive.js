// Varredura semanal — mesma regra do scaffold nativo: nunca mexe em admissão
// "ativo" (a lista principal já filtra por status, então a saída na alta é
// imediata); só migra quem já está "alta"/"obito" pra "arquivado".

const Archive = {
  chaveUltimaVarredura: 'ronda.ultimaVarreduraArquivamento',

  async executarSeNecessario() {
    const ultima = Number(localStorage.getItem(Archive.chaveUltimaVarredura) || 0);
    const seteDias = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - ultima < seteDias) return;

    const admissoes = await WardsDB.Store.where(
      'admissions',
      (a) => (a.status === 'alta' || a.status === 'obito')
    );
    for (const a of admissoes) {
      a.status = 'arquivado';
      await WardsDB.Store.put('admissions', a);
    }
    localStorage.setItem(Archive.chaveUltimaVarredura, String(Date.now()));
  },
};

window.Archive = Archive;
