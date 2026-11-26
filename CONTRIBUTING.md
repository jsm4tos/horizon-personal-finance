# Contribuir

1. Crie uma branch a partir da versão atual.
2. Instale com `npm ci` e execute `npm run setup`.
3. Faça uma alteração com escopo claro.
4. Rode `npm run check:privacy`, `npm test` e `npm run test:ui`.
5. Abra um pull request descrevendo o problema, o resultado e a validação.

Use apenas registros fictícios em testes e capturas. Nunca versione cofres, backups, arquivos de ambiente, executáveis ou caminhos pessoais.

As funções de negócio da interface estão em `ui/app.js`. A persistência está em `src/vault.cjs`. Altere os arquivos diretamente e valide os fluxos afetados. Os scripts históricos usados na criação da versão pessoal não fazem parte desta edição pública.

Uma reorganização em módulos menores é uma evolução possível. Preserve compatibilidade de dados e os totais financeiros ao refatorar.
