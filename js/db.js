// Camada de persistência — fala com o Supabase (Postgres) em vez de
// IndexedDB. Mantém exatamente a mesma API (Store.put/get/all/where/remove)
// que o resto do app já usava, então app.js/report.js/archive.js/
// matching.js não precisaram mudar quase nada por causa dessa troca.
//
// Cada linha das tabelas é {id, user_id, data jsonb, created_at} — ver
// supabase/schema.sql. O registro inteiro (leito, hda, evolucaoTexto,
// criadoEm...) mora dentro de `data`, exatamente como os objetos que o app
// já constrói; `user_id` é preenchido sozinho pelo Postgres
// (default auth.uid()) e a Row Level Security garante que cada usuário só
// vê e só grava o que é seu — não precisa (nem dá pra) filtrar por usuário
// aqui, o banco já faz isso.

function uuid() {
  return crypto.randomUUID();
}

const Store = {
  async put(storeName, obj) {
    const { error } = await SB.from(storeName).upsert({ id: obj.id, data: obj });
    if (error) throw error;
    return obj;
  },

  async get(storeName, id) {
    const { data, error } = await SB.from(storeName).select('data').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  },

  async all(storeName) {
    const { data, error } = await SB.from(storeName).select('data');
    if (error) throw error;
    return (data || []).map((linha) => linha.data);
  },

  // Continua sendo um filtro em JS sobre o resultado de `all` (não uma
  // query indexada no Postgres) — mesmo comportamento de antes, só trocou
  // de onde os dados vêm.
  async where(storeName, predicate) {
    const items = await Store.all(storeName);
    return items.filter(predicate);
  },

  async remove(storeName, id) {
    const { error } = await SB.from(storeName).delete().eq('id', id);
    if (error) throw error;
  },
};

window.WardsDB = { Store, uuid };
