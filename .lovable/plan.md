Instalação em VPS nova (sem mudanças no código)

Antes: aponte o domínio (registro A) para o IP da VPS e libere as portas 80 e 443.

```bash
sudo -i
apt-get update && apt-get install -y git curl
git clone https://github.com/andybq123/remix-of-ouvidoria-track.git /root/controle-seta
cd /root/controle-seta
bash deploy.sh instalar
```

O instalador pede domínio e e-mail do administrador, cria o banco do zero e mostra a senha inicial no final. Se der erro: `tail -n 40 /tmp/ouvidesk-instalacao.log`.
