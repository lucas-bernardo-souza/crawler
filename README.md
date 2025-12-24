WebModelUI Data (WMUID) 2.0

O WebModelUI Data (WMUID) é uma extensão de navegador desenvolvida para atuar como uma ferramenta de extração de dados por meio de engenharia reversa de interfaces web. Esta versão 2.0 representa uma refatoração completa da ferramenta original de 2017, focada em modernização tecnológica e conformidade com os novos padrões de segurança da Web Store.

🚀 Sobre a Refatoração

O projeto foi motivado pela descontinuação do Manifest V2 pelo Google Chrome, o que tornaria a ferramenta original inoperante em 2025. A reengenharia seguiu três pilares principais:

    Migração para Manifest V3: Substituição de scripts de segundo plano (background scripts) persistentes por Service Workers efêmeros, exigindo uma nova lógica de gerenciamento de estado e comunicação assíncrona.

Remoção do jQuery (Vanilla JS): Eliminação da dependência da biblioteca jQuery em favor do JavaScript nativo (ES6+), otimizando o desempenho e reduzindo o consumo de recursos computacionais.

Arquitetura Modular: Reestruturação do código monolítico original para um design orientado a objetos com classes ES6, garantindo maior coesão e facilidade de manutenção futura.

🛠️ Funcionalidades

A ferramenta permite a extração de dados através de duas abordagens principais:

    Crawler: Mapeia estaticamente a estrutura HTML e elementos interativos para identificar conexões entre páginas.

Tracer: Monitora dinamicamente a navegação e interações em tempo real para registrar o comportamento da interface.

Os dados extraídos são exportados em formato XML, sendo 100% compatíveis com o ecossistema de visualização ModelUIViz.

💻 Desenvolvimento e Build

Este projeto utiliza o Vite para proporcionar um ambiente de desenvolvimento rápido e otimizado para extensões modernas.
Pré-requisitos

    Node.js (versão LTS recomendada)

    NPM (instalado junto com o Node)

Passos para Build

Siga as instruções abaixo para compilar o projeto localmente:

    Clone o repositório:
    Bash

git clone https://github.com/seu-usuario/webmodelui-data.git
cd webmodelui-data

Instale as dependências:
Bash

npm install

Execute o Build com o Vite:
Bash

npm run build

Este comando gerará uma pasta chamada dist ou build contendo todos os arquivos otimizados e o arquivo manifest.json atualizado.

    Carregue na Extensão do Chrome:

        Abra o Google Chrome e vá para chrome://extensions/.

        Ative o Modo do desenvolvedor no canto superior direito.

        Clique em Carregar sem compactação.

        Selecione a pasta gerada pelo build no passo anterior.

🎓 Créditos

Projeto desenvolvido como parte do trabalho de conclusão de curso na UNESP - Faculdade de Ciências e Tecnologia, sob orientação do Prof. Dr. Rogério E. Garcia.
