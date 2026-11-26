# Segurança

## Escopo

Esta versão pública mantém os registros em um cofre local criptografado. Não inclui telemetria, login remoto, sincronização nem credenciais de serviços.

A interface não acessa Node diretamente: usa uma ponte IPC com isolamento de contexto e sandbox. O processo principal verifica a janela e a origem dos pedidos. Navegação externa, novas janelas e requisições de rede da interface são bloqueadas.

O banco utiliza SQLite3 Multiple Ciphers em modo SQLCipher, com AES-256, PBKDF2-HMAC-SHA512 e 256.000 iterações. Uma revisão do estado impede sobrescrever silenciosamente uma revisão antiga. Exclusões em lote, importações e trocas de senha preservam cópias criptografadas.

## Limites

- O cofre aberto mantém dados e material de chave na memória.
- Um sistema comprometido pode capturar a senha ou ler a interface.
- O app não tem auditoria independente, assinatura digital ou atualizador automático.
- Backups precisam de proteção e da senha da época em que foram feitos.
- Importações devem vir de fontes confiáveis. Não anexe bases pessoais a issues.

## Relatar um problema

Se o repositório oferecer **Security > Report a vulnerability**, utilize esse canal privado. Caso não esteja habilitado, abra uma issue pedindo um canal privado, sem detalhes exploráveis, senhas, arquivos de banco ou informações financeiras. O mantenedor deve habilitar o reporte privado nas configurações do GitHub.

Não publique cofres, backups, logs que revelem caminhos pessoais nem capturas com valores reais.
