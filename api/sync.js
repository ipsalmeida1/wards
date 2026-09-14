// Sincronização automática entre aparelhos: cada "código de sincronização"
// (gerado no aparelho, nunca escolhido por nós) vira um arquivo só seu no
// Blob Store privado da Vercel. GET lê o estado atual; POST sobrescreve com
// o dump enviado pelo aparelho. Quem não sabe o código não acha o arquivo —
// não existe listagem pública, e o store é privado.

const { put, get } = require('@vercel/blob');

function pathnameDoCodigo(codigo) {
  return `sync/${codigo}.json`;
}

module.exports = async (req, res) => {
  const codigo = String(req.query.code || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(codigo)) {
    res.status(400).json({ erro: 'código de sincronização inválido' });
    return;
  }
  const pathname = pathnameDoCodigo(codigo);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (req.method === 'GET') {
    try {
      // O Blob da Vercel cacheia no CDN por até 1 mês por padrão — como a
      // mesma URL é reescrita a cada POST (allowOverwrite), um GET logo
      // depois de sincronizar em outro aparelho podia devolver uma versão
      // antiga por tempo indeterminado (visto na prática: minutos). Buscar
      // via `get()` com `useCache:false` lê direto da origem, sem CDN, e
      // garante a versão mais recente de verdade.
      const resultado = await get(pathname, { access: 'private', useCache: false, token });
      if (!resultado || resultado.statusCode !== 200 || !resultado.stream) {
        throw new Error('blob não encontrado');
      }
      const dump = await new Response(resultado.stream).json();
      res.status(200).json(dump);
    } catch {
      res.status(200).json({ versao: 1, stores: {} });
    }
    return;
  }

  if (req.method === 'POST') {
    let corpo = '';
    for await (const pedaco of req) corpo += pedaco;
    let dump;
    try {
      dump = JSON.parse(corpo);
    } catch {
      res.status(400).json({ erro: 'corpo inválido' });
      return;
    }
    await put(pathname, JSON.stringify(dump), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      token,
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ erro: 'método não suportado' });
};
