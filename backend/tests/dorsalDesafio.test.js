const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseMemoria } = require('./helpers/supabaseMemoria');
const { asignarDorsal, leerDorsal, formatearDorsal } = require('../lib/dorsalDesafio');

test('dorsales: desafíos independientes, reintento estable y número histórico intacto', async () => {
  const m = crearSupabaseMemoria({ users: [{ id: 'u', bib_number: 990 }], user_challenges: [
    { id: 'a', user_id: 'u', challenge_id: 'santiago' },
    { id: 'b', user_id: 'u', challenge_id: 'appia' },
    { id: 'c', user_id: 'v', challenge_id: 'appia' },
    { id: 'viejo', challenge_id: 'fuji', numero_bib: 248 },
  ] });
  assert.equal(await asignarDorsal(m.cliente, 'a'), 1);
  assert.equal(await asignarDorsal(m.cliente, 'b'), 1);
  assert.equal(await asignarDorsal(m.cliente, 'c'), 2);
  assert.equal(await asignarDorsal(m.cliente, 'b'), 1);
  assert.equal(await asignarDorsal(m.cliente, 'viejo'), 248);
  assert.equal(formatearDorsal(await leerDorsal(m.cliente, 'a')), '0001');
  assert.equal(m.db.users[0].bib_number, 990);
});

test('dorsales: si falla la reserva, no inventa un número ni usa el global', async () => {
  await assert.rejects(asignarDorsal({ rpc: async () => ({ error: new Error('base caída') }) }, 'a'), /base caída/);
  await assert.rejects(asignarDorsal({ rpc: async () => ({ data: null }) }, 'a'), /válido/);
  assert.equal(formatearDorsal(null), '---');
});
