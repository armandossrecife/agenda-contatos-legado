## O que este PR faz

<!-- Descreva a mudança em uma ou duas frases. Para correções, diga qual era o comportamento errado. -->

Fecha #<!-- número da issue -->

## Aplicação afetada

- [ ] agenda-backend
- [ ] agenda-frontend

## Tipo de mudança

- [ ] Nova funcionalidade (`feature/*`)
- [ ] Correção (`bugfix/*` ou `hotfix/*`)
- [ ] Documentação
- [ ] Refatoração sem mudança de comportamento

## Como foi testado

- [ ] `mvn clean package` na raiz termina com `BUILD SUCCESS` (inclui os testes do backend)
- [ ] Testes de integração da API (README do backend, seção 9.4), se o backend mudou
- [ ] `python3 agenda-frontend/tests/teste_e2e.py` passou, se o frontend mudou
- [ ] Testado manualmente no Tomcat 8.5 com JDK 8

## Contrato entre as aplicações

- [ ] Não altera rotas, formato do JSON nem regras de validação
- [ ] Altera o contrato, e as duas aplicações foram atualizadas neste PR

## Documentação

- [ ] README da aplicação afetada atualizado, se necessário
