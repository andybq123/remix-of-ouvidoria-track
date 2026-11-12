export function adicionarDominio(source, domain) {
  domain = domain.trim().toLowerCase();
  if (domain.length > 253 || !domain.includes('.') || !domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Informe somente um domínio válido, sem https:// ou caminhos.');
  }
  const blocks = [...source.matchAll(/^# >>> buraco-deploy[^\n]*\n([\s\S]*?)^# <<< buraco-deploy[^\n]*/gm)];
  if (blocks.length !== 1) throw new Error('É necessário exatamente um bloco identificado do Buraco no Caddyfile. Nenhuma alteração realizada.');
  const block = blocks[0];
  const header = block[1].match(/^([^\n{]+)\s*\{/);
  if (!header) throw new Error('Bloco do Buraco não reconhecido. Nenhuma alteração realizada.');
  const domains = header[1].trim().split(/\s*,\s*/);
  if (domains.includes(domain)) return source;
  const outside = source.slice(0, block.index) + source.slice(block.index + block[0].length);
  if (outside.includes(domain)) throw new Error('O domínio já aparece fora do bloco do Buraco. Revise a configuração antes de continuar.');
  const updated = block[0].replace(header[0], `${domains.join(', ')}, ${domain} {`);
  return source.slice(0, block.index) + updated + source.slice(block.index + block[0].length);
}