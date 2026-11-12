import test from 'node:test';
import assert from 'node:assert/strict';
import { adicionarDominio } from '../../buraco-deploy/dominio-config.mjs';

const other = 'ouvidesk.example.com {\n reverse_proxy 127.0.0.1:8080\n}\n';
const block = '# >>> buraco-deploy (não editar à mão)\nburaco.brusque.app.br {\n @supabase path /auth/v1/* /rest/v1/* /storage/v1/*\n reverse_proxy @supabase 127.0.0.1:54331\n reverse_proxy 127.0.0.1:8081\n}\n# <<< buraco-deploy\n';
test('ambos os domínios servem o mesmo app e banco sem alterar OuviDesk', () => {
  const result = adicionarDominio(other + block, 'buraco.chatizy.com.br');
  assert.equal(result, other + block.replace('buraco.brusque.app.br {', 'buraco.brusque.app.br, buraco.chatizy.com.br {'));
});
test('reaplicação não duplica o domínio', () => {
  const result = adicionarDominio(block, 'buraco.chatizy.com.br');
  assert.equal(adicionarDominio(result, 'buraco.chatizy.com.br'), result);
});
test('recusa domínio que já pertence a outro bloco', () => {
  assert.throws(() => adicionarDominio(other + block, 'ouvidesk.example.com'), /fora do bloco/);
});
test('recusa configuração sem marcação e entradas que injetam Caddy', () => {
  assert.throws(() => adicionarDominio(other, 'buraco.chatizy.com.br'), /exatamente um bloco/);
  assert.throws(() => adicionarDominio(block, 'x.com {\nredir evil.com'), /válido/);
});