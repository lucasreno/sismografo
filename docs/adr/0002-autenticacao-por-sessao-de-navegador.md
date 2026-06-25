# Autenticação por Sessão de navegador, não por cofre de senhas

A autenticação de cada Instância é modelada como uma **Sessão**: um perfil de navegador persistente (cookies/tokens, via contexto persistente do Playwright), estabelecido interativamente uma vez e reusado pelos Ciclos. O **Método de Autenticação** é plugável (`sessão-de-navegador`/SSO, `usuário-senha`, etc.).

**Por quê:** a aplicação roda em múltiplos SO (DPAPI/Windows descartado) e o piloto autentica via Keycloak/SSO, onde não há senha a guardar — só uma sessão de IdP já logada no navegador. A Sessão persistente cobre SSO sem armazenar segredo algum; para métodos que têm segredo (usuário/senha), os valores ficam no chaveiro nativo do SO via camada de abstração, com fallback de cofre cifrado por senha mestra em ambientes sem chaveiro.

**Consequência:** falha de autenticação **não** é Anomalia da aplicação. Quando a Sessão expira, a Instância entra em "requer reautenticação", o monitoramento dela pausa e o usuário é avisado — evitando poluir a Linha de Base com falsas anomalias. Sessões precisam de renovação interativa periódica.
