// Sincronização automática via nuvem — usa o mesmo formato de dump do
// Backup (js/backup.js), só que em vez de baixar/escolher um arquivo, manda
// e busca via /api/sync. Fluxo de cada "Sincronizar agora": busca o que está
// na nuvem, importa aqui (upsert por id, mescla com o que já existia),
// depois manda o resultado já mesclado de volta pra nuvem — assim o outro
// aparelho, na próxima vez que sincronizar, recebe os dois lados juntos.

const CHAVE_CODIGO = 'wards.syncCode';

const Sync = {
  temCodigo() {
    return !!localStorage.getItem(CHAVE_CODIGO);
  },

  codigoAtual() {
    return localStorage.getItem(CHAVE_CODIGO) || '';
  },

  gerarNovoCodigo() {
    // 2x UUID sem hífen = 64 caracteres hex, bem acima do que dá pra
    // adivinhar por tentativa — funciona como uma senha de fato.
    const codigo = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
    localStorage.setItem(CHAVE_CODIGO, codigo);
    return codigo;
  },

  usarCodigo(codigo) {
    localStorage.setItem(CHAVE_CODIGO, codigo.trim());
  },

  limparCodigo() {
    localStorage.removeItem(CHAVE_CODIGO);
  },

  async buscarNuvem() {
    const resp = await fetch(`/api/sync?code=${encodeURIComponent(Sync.codigoAtual())}`);
    if (!resp.ok) throw new Error('falha ao buscar da nuvem');
    return resp.json();
  },

  async enviarNuvem(dump) {
    const resp = await fetch(`/api/sync?code=${encodeURIComponent(Sync.codigoAtual())}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dump),
    });
    if (!resp.ok) throw new Error('falha ao enviar pra nuvem');
  },

  async sincronizarAgora() {
    const remoto = await Sync.buscarNuvem();
    const totalImportado = await Backup.importarDump(remoto);
    const mesclado = await Backup.montarDump();
    await Sync.enviarNuvem(mesclado);
    return totalImportado;
  },
};

window.Sync = Sync;
