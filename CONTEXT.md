# Sismógrafo

Monitora aplicações web executando fluxos de tarefas contra suas instâncias, aprende o comportamento normal e registra anomalias como um livro de sintomas e diagnósticos para investigação e ação.

## Language

**Aplicação**:
O tipo de software monitorado (ex.: "Aplicação A"). É o nível em que os fluxos são definidos. Não tem URL própria — quem tem URL é a Instância.
_Avoid_: Sistema, App, Produto

**Instância**:
Uma implantação concreta de uma Aplicação numa URL específica (ex.: cliente X, Y, Z). É o alvo contra o qual os fluxos são executados e contra o qual se mede o comportamento normal.
_Avoid_: Cliente, Ambiente, Alvo, Deployment

**Fluxo**:
Um roteiro gravado de interações de navegador (abrir tela, logar, consultar) que exercita uma funcionalidade da Aplicação. Definido uma vez na Aplicação e executado contra cada Instância. Composto por Passos.
_Avoid_: Tarefa, Rotina, Job, Script

**Passo**:
Uma ação individual dentro de um Fluxo (ex.: navegar, clicar, preencher, esperar). É a menor unidade que produz uma Medição.
_Avoid_: Etapa, Ação, Comando

**Parâmetro**:
Um input do Fluxo marcado como variável em vez de chumbado durante a gravação (ex.: `competencia`). Declarado no Fluxo; seu valor concreto é definido por instância na Calibração.
_Avoid_: Variável, Campo, Argumento

**Calibração**:
O conjunto de valores de Parâmetros (e ajustes) para a combinação (Fluxo × Instância). Garante entradas fixas e comparáveis ao longo do tempo. Uma Instância sem Calibração não pode executar o Fluxo.
_Avoid_: Configuração, Vínculo, Setup

**Medição**:
O conjunto de sinais capturados ao executar um Passo contra uma Instância: duração, TTFB, bytes da resposta, nº de requisições, status e, opcionalmente, sinais declarados. É o "sismograma" bruto sobre o qual a detecção de anomalia opera.
_Avoid_: Métrica, Amostra, Leitura, Sinal

**Ciclo de Monitoramento**:
Uma passada completa que executa todos os Fluxos contra todas as Instâncias de uma Aplicação, de forma sequencial. Agendado de hora em hora (configurável por Aplicação) e também disparável manualmente.
_Avoid_: Execução, Rodada, Run, Job

**Verificação de Ambiente**:
Teste de alcançabilidade barato que precede cada Ciclo. Se o próprio Sismógrafo está sem rede/VPN para chegar aos alvos, o Ciclo não roda e nenhum Incidente de aplicação abre — sobe apenas o alerta "ambiente de monitoramento indisponível". Evita falso-positivo por causa externa ao alvo.
_Avoid_: Preflight, Healthcheck, Ping

**Linha de Base**:
A faixa esperada de uma métrica para uma combinação (Fluxo, Passo, Instância, métrica), calculada com estatística robusta (mediana + MAD) de forma incremental. Existe desde a primeira Medição: a tolerância é larga no início e estreita conforme a amostra cresce (confiança graduada), sem período morto sem monitoramento.
_Avoid_: Baseline, Normal, Referência, Threshold

**Anomalia**:
Uma Medição que se afasta da Linha de Base além do limiar vigente, ou uma falha dura (erro de status, Fluxo interrompido). É o sinal sísmico bruto que pode dar origem a um Incidente.
_Avoid_: Alerta, Desvio, Erro, Outlier

**Incidente**:
O caso investigável — a entrada do livro de registros. Abre automaticamente quando Anomalias relacionadas persistem, agrupa as Anomalias do episódio (seus Sintomas) e fecha sozinho quando o sinal volta à Linha de Base. Ciclo de vida: aberto → em investigação → diagnosticado → resolvido.
_Avoid_: Ocorrência, Episódio, Caso, Ticket

**Incidente Ambiental**:
Uma classificação de Incidente cuja causa é compartilhada/externa à aplicação (ex.: VPN, rede, infraestrutura). Aberto pela guarda de correlação quando grande fração das Instâncias da mesma Aplicação fica anômala no mesmo Ciclo, em vez de N Incidentes individuais.
_Avoid_: Falso-positivo, Incidente de infra

**Sintoma**:
Uma Anomalia lida dentro do contexto de um Incidente (ex.: "TTFB 8 desvios acima por 3 horas"). Não é um tipo próprio: é o papel clínico que a Anomalia assume no caso.
_Avoid_: Sinal, Manifestação

**Diagnóstico**:
A causa concluída de um Incidente, preenchida na investigação. Distingue causa real da aplicação de variação legítima (ex.: volume de dados).
_Avoid_: Causa raiz, Análise, Conclusão

**Plano de Ação**:
As ações decididas para um Incidente, com responsável e status, preenchidas pelo usuário.
_Avoid_: Tarefas, Remediação, To-do

**Relatório**:
A exportação que consolida Incidentes com seus Sintomas, Diagnóstico e Plano de Ação. Dois recortes: por Aplicação num intervalo (o boletim periódico, agrupado por Instância) ou de um Incidente isolado (dossiê do caso). Voltado a público interno/técnico; nunca expõe segredos.
_Avoid_: Export, Dossiê, Documento

**Sessão**:
O estado de autenticação vivo de uma Instância — um perfil de navegador persistente (cookies/tokens) que os Ciclos reusam para rodar Fluxos sem refazer login. Estabelecida interativamente uma vez; quando expira, a Instância entra em "requer reautenticação" e o monitoramento dela pausa (não gera Anomalia).
_Avoid_: Login, Token, Perfil

**Método de Autenticação**:
A estratégia plugável de autenticação de uma Instância (ex.: `sessão-de-navegador`/SSO, `usuário-senha`). Define como a Sessão é estabelecida. Segredos, quando existem, ficam no chaveiro nativo do SO (com fallback de cofre cifrado).
_Avoid_: Auth, Credencial, Estratégia
