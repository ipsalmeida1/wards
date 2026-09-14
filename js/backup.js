// Export/import manual entre aparelhos — como o app não sincroniza sozinho
// (cada iPhone/iPad guarda seu próprio IndexedDB), isto gera um arquivo com
// tudo e permite importar no outro aparelho. Fotos de exame (Blob) viram
// base64 pra caber no JSON.

const BACKUP_STORES = [
  'patients', 'comorbidades', 'admissions', 'problemas',
  'diagnosisCategories', 'roundEntries', 'exams', 'opinions', 'planItems',
  'attachments', 'vitalSigns',
];

function blobParaBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
async function base64ParaBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

const Backup = {
  async montarDump() {
    const dump = { versao: 1, exportadoEm: Date.now(), stores: {} };
    for (const nome of BACKUP_STORES) {
      const itens = await WardsDB.Store.all(nome);
      if (nome === 'attachments') {
        dump.stores[nome] = await Promise.all(
          itens.map(async (a) => ({ ...a, blob: await blobParaBase64(a.blob) }))
        );
      } else {
        dump.stores[nome] = itens;
      }
    }
    return dump;
  },

  async baixarArquivo() {
    const dump = await Backup.montarDump();
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wards-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  // Upsert por id: registro que já existe (mesmo id) é sobrescrito pelo do
  // arquivo; registro novo é adicionado. Nada é apagado. Não faz merge fino
  // por campo — se o mesmo registro foi editado nos dois aparelhos entre uma
  // exportação e outra, quem importar por último vence.
  async importarDump(dump) {
    let total = 0;
    for (const nome of BACKUP_STORES) {
      const itens = (dump.stores && dump.stores[nome]) || [];
      for (const item of itens) {
        if (nome === 'attachments' && typeof item.blob === 'string') {
          item.blob = await base64ParaBlob(item.blob);
        }
        await WardsDB.Store.put(nome, item);
        total++;
      }
    }
    return total;
  },
};

window.Backup = Backup;
