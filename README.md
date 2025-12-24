# WebModelUI Data (WMUID) 2.0

[![JavaScript](https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E)]()
[![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)]() 
[![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)]()
[![Chrome](https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)]()
[![Manifest V3](https://img.shields.io/badge/Manifest%20V3-000000?style=for-the-badge&logo=googlechrome&logoColor=white)]()
[![License](https://img.shields.io/badge/License-MIT-2ea44f?style=for-the-badge)](LICENSE)

O **WebModelUI Data (WMUID)** é uma extensão de navegador que atua como uma ferramenta de extração de dados para o ecossistema de visualização ModelUIViz. Esta versão 2.0 representa a modernização completa da ferramenta original de 2017, garantindo sua sobrevivência tecnológica diante das mudanças no ecossistema do Google Chrome.

## 🎯 Objetivos do Projeto

A refatoração foi fundamentada em três pilares principais:

- **Migração para Manifest V3:** Atualização do ambiente de execução para cumprir as novas exigências de segurança e performance do navegador.
- **Remoção de Dependências:** Substituição total da biblioteca jQuery por JavaScript nativo (ES6+), reduzindo o consumo de recursos e alinhando o código aos padrões modernos.
- **Otimização Arquitetural:** Transição de scripts monolíticos para um design modular orientado a classes, utilizando Service Workers como orquestradores centrais.

## 🛠️ Funcionalidades

A ferramenta utiliza técnicas de engenharia reversa para extrair dados da interface através de duas abordagens:

- **Crawler:** Realiza o mapeamento estático da estrutura HTML e identifica conexões entre páginas usando uma estratégia de rastreamento em largura (Breadth-First).
- **Tracer:** Monitora dinamicamente a navegação e as interações do usuário, registrando o comportamento real da interface.

Os dados são exportados em arquivos XML 100% compatíveis com a ferramenta de visualização WebModelUI Tool.

## 🚀 Tecnologias Utilizadas

- JavaScript (ES6+)
- Manifest V3
- Service Workers
- Vite (Ferramenta de Build e Desenvolvimento)

## 📦 Como Buildar o Projeto

Este projeto utiliza o Vite para gerenciar o empacotamento da extensão. Certifique-se de ter o Node.js e o NPM instalados em sua máquina.

1. Clone o repositório:

git clone https://github.com/seu-usuario/webmodelui-data.git
cd webmodelui-data

text

2. Instale as dependências:

npm install

text

3. Gere o build do projeto:

npm run build

text

4. Carregue no Navegador:
- Acesse `chrome://extensions/` no Google Chrome.
- Ative o "Modo do desenvolvedor".
- Clique em "Carregar sem compactação" e selecione a pasta `dist` gerada pelo comando de build.

## ✅ Validação

A eficácia da refatoração foi validada por meio de um estudo de caso no portal "Guia de Serviços" da Prefeitura de Presidente Prudente. O plugin foi capaz de rastrear fluxos complexos, como login e cadastro de usuários, gerando modelos de navegação e interação processados corretamente pela ferramenta ModelUIViz.

## 🎓 Créditos

Desenvolvido por Lucas B. de Souza sob orientação do Prof. Dr. Rogério E. Garcia. Vínculo: Departamento de Matemática e Computação - UNESP Presidente Prudente
