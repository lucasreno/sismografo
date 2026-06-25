# Detecção de anomalia por estatística robusta, não ML

A detecção de anomalia usa estatística robusta e explicável (mediana + MAD, z-score modificado) calculada de forma incremental por combinação `(Fluxo, Passo, Instância, métrica)`, em vez de modelos de machine learning (Prophet, Isolation Forest etc.).

**Por quê:** o sistema roda local, com baixo volume de dados (~24 medições/dia por combinação) e sem dados rotulados — cenário ruim para ML. Mediana+MAD são robustos a outliers (um pico não envenena o normal), exigem pouco dado e, sobretudo, são **explicáveis**: toda Anomalia vem acompanhada de "esperado ~200ms (±40), veio 1.240ms = 8 desvios". A tolerância é larga com poucas amostras e estreita conforme a amostra cresce (confiança graduada), permitindo monitorar desde a primeira Medição sem período morto. Falhas duras (erro de status, Fluxo interrompido) são Anomalia imediata, independentes da estatística.

**Consequência:** sazonalidade (hora/dia) só será adicionada via baldes se os dados mostrarem necessidade; não se começa com ela. Se um dia o volume e a maturidade justificarem, um modelo mais sofisticado pode ser reavaliado — mas o default deliberado é o caminho simples e explicável.
