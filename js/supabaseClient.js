// Cliente do Supabase — projeto multiusuário do Wards.
//
// A anon key abaixo NÃO é segredo (é assim que o Supabase foi desenhado:
// segura de embutir no cliente) — a proteção de verdade é a Row Level
// Security do banco (supabase/schema.sql), que garante que cada usuário só
// enxerga e só escreve as próprias linhas, não importa o que o cliente
// tente pedir.
const SUPABASE_URL = 'https://jmaeqnpdnllachqvhibk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYWVxbnBkbmxsYWNocXZoaWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MzUxNDcsImV4cCI6MjEwNTAxMTE0N30.hPYo_PtRX8AaqLnxCh7AlXV6u6ZU737MG4gZZeLLBrE';

// `window.supabase` é o global exposto pelo script UMD carregado antes
// deste (ver index.html) — a instância do client fica em `SB` pra não
// colidir com esse nome.
const SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.SB = SB;
