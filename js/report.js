// Relatório mensal — altas do mês pedido, contadas pela Hipótese
// Diagnóstica (HD) perguntada no momento da alta.

const Report = {
  async mensal(ano, mes) { // mes: 0-11
    const inicio = new Date(ano, mes, 1).getTime();
    const fim = new Date(ano, mes + 1, 1).getTime();

    const categorias = await WardsDB.Store.all('diagnosisCategories');
    const nomeById = Object.fromEntries(categorias.map((c) => [c.id, c.nome]));

    const altas = await WardsDB.Store.where(
      'admissions',
      (a) => a.dataAlta >= inicio && a.dataAlta < fim
    );
    const contagemHD = {};
    // Só nomes vindos de uma diagnosisCategories de verdade podem ser
    // renomeados no relatório — "(sem HD registrada)" e um hdFinal cru (sem
    // categoria resolvida, de dado bem antigo) não têm registro nenhum por
    // trás pra atualizar.
    const nomesComCategoria = new Set();
    for (const a of altas) {
      const nomeReal = nomeById[a.hdFinalCategoryId];
      const nome = nomeReal || a.hdFinal || '(sem HD registrada)';
      if (nomeReal) nomesComCategoria.add(nome);
      contagemHD[nome] = (contagemHD[nome] || 0) + 1;
    }

    return Object.entries(contagemHD)
      .map(([categoria, total]) => ({ categoria, total, renomeavel: nomesComCategoria.has(categoria) }))
      .sort((a, b) => b.total - a.total);
  },
};

window.Report = Report;
