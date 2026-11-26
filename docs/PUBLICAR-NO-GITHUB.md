# Publicar o projeto

Esta pasta contém somente código, testes, documentação e imagens com dados fictícios. Os arquivos de download ficam fora do repositório, na pasta de entrega.

## Código

1. Na sua conta do GitHub, crie um repositório público chamado `horizon-personal-finance`.
2. Deixe-o vazio, sem gerar outro README, licença ou .gitignore.
3. Abra um terminal nesta pasta. O repositório local já pode estar inicializado na entrega; confira com `git status`.
4. Se ainda não houver commit, use `git add .` e `git commit -m "Primeira versão pública do Horizon"`.
5. Vincule o endereço do repositório mostrado pelo GitHub e envie:

```sh
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Substitua somente `URL_DO_REPOSITORIO` pelo endereço da sua conta. O envio exige sua autenticação no GitHub. Nenhuma senha ou token deve entrar no código.

Também é possível enviar os arquivos do ZIP de código-fonte pela interface do GitHub. Não envie node_modules, cofres, backups ou a distribuição binária como arquivos comuns do repositório.

## Download para outras pessoas

Crie uma Release com a tag `v1.0.0` e título **Horizon 1.0.0 — personal finance**. Anexe:

- `Horizon-v1.0.0-windows-x64.zip`
- `SHA256SUMS.txt`

Use [o texto de lançamento](RELEASE-v1.0.0.md). O GitHub gera automaticamente os arquivos de código-fonte da tag.

Depois disso, seu amigo acessa a página de Releases, baixa o ZIP Windows, extrai tudo e abre Horizon.exe.

## Apresentação do repositório

Descrição sugerida:

> Planejamento financeiro pessoal offline com Electron, cartões parcelados, metas e cofre SQLite criptografado.

Topics sugeridos: `electron`, `javascript`, `personal-finance`, `sqlite`, `offline-first`, `windows`.

Habilite o reporte privado de vulnerabilidades nas configurações de segurança do repositório, se disponível. A distribuição desta entrega não tem assinatura digital ou atualização automática.
