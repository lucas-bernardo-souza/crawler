class WebCrawler {
    constructor() {
        this.linksPorPai = [];
        this.linksAcessados = [];
        this.xmlSite = '';
        this.xmlStructure = '';
        this.componentMap = new Map();
        this.numPagina = 1;
        this.numComponente = 1;
        this.numEvento = 1;
        this.numState = 1;
        this.index = 'true';
        this.domain = new URL(window.location.href).hostname;
        this.DOM = [];
        this.itemAtual = 0;
        this.keepAliveInterval = null;
        this.timeoutId = null;
        this.numEdge = 1;
        this.isPaginaFechada = false;

        // Timeout de segurança para evitar travamentos
        this.timeoutId = setTimeout(() => {
            console.warn("Timeout de segurança ativado");
            this.finalizaCrawler();
        }, 300000); // 5 minutos
    }

    async iniciar() {
        this.xmlSite = '<?xml version="1.0" encoding="UTF-8"?>\n';
        this.xmlSite += `<site url="${window.location.href}" titulo="${document.title}" tipo="crawler">\n`;
        this.xmlSite += '\t<pages>\n\n'
        // Configurar heartbeat
        this.setupHeartbeat();

        // Iniciar processamento
        this.processaDom();
    }

    setupHeartbeat() {
        if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
        this.keepAliveInterval = setInterval(() => {
            chrome.runtime.sendMessage({ action: "keepAlive" }).catch(() => { });
        }, 15000);
    }

    rastrear() {
        this.processaDom();
    }

    initializeState(state) {
        this.linksPorPai = state.linksPorPai || [];
        this.linksAcessados = state.linksAcessados || [];
        this.xmlSite = state.xmlSite || '';
        this.xmlStructure = state.xmlStructure || '';
        this.numPagina = state.numPagina || 1;
        this.numComponente = state.numComponente || 1;
        this.numEvento = state.numEvento || 1;
        this.numState = state.numState || 1;
        this.index = state.index || 'true';
        this.numEdge = state.numEdge || 1;
    }

    getCurrentState() {
        return {
            linksPorPai: this.linksPorPai,
            linksAcessados: this.linksAcessados,
            xmlSite: this.xmlSite,
            xmlStructure: this.xmlStructure,
            numPagina: this.numPagina,
            numComponente: this.numComponente,
            numEvento: this.numEvento,
            numState: this.numState,
            index: this.index,
            numEdge: this.numEdge
        };
    }

    escapeXML(texto){
        if(typeof texto !== 'string'){
            return '';
        }
        return texto.replace(/&/g, '&amp;')
                   .replace(/</g, '&lt;')
                   .replace(/>/g, '&gt;')
                   .replace(/"/g, '&quot;')
                   .replace(/'/g, '&apos;');
    }

    processaDom() {
        try {
            this.fecharPaginaAtual();

            // Estrutura inicial da página
            const url = this.escapeXML(window.location.href);
            const title = this.escapeXML(document.title);
            this.adicionaLinkAcessado(window.location.href);
            
            this.xmlSite += `\t\t<page url="${url}" titulo="${title}" node_id="${this.numPagina}" index="${this.index}">\n`;
            this.xmlSite += `\t\t<event name="onLoad" node_id="${this.numPagina}" item_id="null" event_id="${this.numEvento}"/>\n`;
            this.numEvento++;
            this.xmlSite += `\t\t<state name="onLoad" node_id="${this.numPagina}" item_id="null" state_id="${this.numState}"/>\n`;
            this.numState++;
            this.xmlSite += `\t\t<state name="Load" node_id="${this.numPagina}" item_id="null" state_id="${this.numState}"/>\n`;
            this.numState++;
            
            this.isPaginaFechada = false;

            if(this.index === 'true'){
                this.index = 'false';
            }

            // Coletar elementos do documento principal
            this.DOM = Array.from(document.body.querySelectorAll('*'));

            // Processar iframes
            const iframes = document.querySelectorAll('iframe');

            for (const iframe of iframes) {
                try {
                    if (iframe.contentDocument && iframe.contentDocument.body) {
                        const iframeElements = iframe.contentDocument.querySelectorAll('body *');
                        this.DOM.push(...Array.from(iframeElements));
                    }
                } catch (e) {
                    console.warn('Não foi possível acessar iframe:', e);
                }
            }
            this.mapeiaProximoComponente();
        } catch (error) {
            console.error("Erro em processaDom:", error);
            this.fecharPaginaAtual();
            this.finalizaCrawler();
        }
    }

    finalizaMapeamentoPagina() {
        // Garante que será executado apenas uma vez por página
        if (this.isPaginaFechada) return;
        // Inicia o mapeamento da estrutura da página
        this.geraEstruturaDOM();

        this.fecharPaginaAtual();
        this.acessaProximoLink();
    }

    mapeiaProximoComponente(){
        try{
            // Verifica se ainda há componentes para processar
            if(this.itemAtual >= this.DOM.length){
                this.finalizaMapeamentoPagina();
                return;
            }

            this.mostrarStatus(`Rastreando Componente: ${this.itemAtual + 1} de ${this.DOM.length}`);
            
            //Processa componente atual
            try{
                this.mapeiaComponente(this.itemAtual);
            } catch(componentError){
                console.warn(`Erro no componente ${this.itemAtual}, continuando...:`, componentError);
            }

            this.itemAtual++;

            // Agenda o próximo processamento de forma assíncrona
            setTimeout(() => {
                try {
                    this.mapeiaProximoComponente();
                } catch (asyncError) {
                    console.error("Erro assíncrono, finalizando crawler:", asyncError);
                    this.finalizaCrawler(); // Finaliza geral em caso de erro grave
                }
            }, 0);
        }catch(criticalError){
            console.error("Erro crítico, finalizando crawler:", criticalError);
            this.finalizaCrawler();
        }
    }

    mapeiaComponente(dom_id) {
        const elemento = this.DOM[dom_id];
        if (!elemento || !elemento.tagName) return;

        const tag = elemento.tagName.toLowerCase();

        switch (tag) {
            case 'a':
                const url = elemento.href;
                if (url && url !== '') {
                    const externo = new URL(url, window.location.href).hostname !== this.domain;

                    let currentPageData = this.linksPorPai.find(p => p.id === this.numPagina);
                    if (!currentPageData) {
                        currentPageData = { id: this.numPagina, links: [] };
                        this.linksPorPai.push(currentPageData);
                    }

                    const absoluteUrl = new URL(url, window.location.href).href;
                    if (!this.checkMedia(absoluteUrl) && !externo) {
                        currentPageData.links.push({ 
                            link: absoluteUrl, 
                            componente: this.numComponente,
                            evento: this.numEvento,       
                            evento2: this.numEvento + 1    
                        });
                    }

                    this.componentMap.set(dom_id, {
                        itemId: this.numComponente,
                        type: 'link',
                        name: this.verificaVazio(elemento.textContent),
                        externo: externo ? 'true' : 'false',
                        isComponent: true
                    });

                    this.xmlSite += `\t\t\t<component type="link" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.textContent)}" externo="${externo ? 'true' : 'false'}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"><![CDATA[${elemento.getAttribute('href')}]]></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="not visited" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="visited" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                }
                break;

            case 'input':
                var tipo = elemento.type ? elemento.type.toLowerCase() : 'text';
                var botoes = ["button", "reset", "submit", "image"];
                var campos = ["text", "color", "date", "datetime", "datetime-local", "email", "month", "number", "file", "password", "search", "tel", "time", "url", "week", "hidden"];
                var checks = ["checkbox", "radio"];

                if (botoes.indexOf(tipo) != -1) {
                    this.componentMap.set(dom_id, {
                        itemId: this.numComponente,
                        type: 'button',
                        name: this.verificaVazio(elemento.getAttribute('name')),
                        isComponent: true
                    });
                    this.xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="selected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notselected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                } else if (campos.indexOf(tipo) != -1 || tipo === 'range') {
                    this.componentMap.set(dom_id, {
                        itemId: this.numComponente,
                        type: 'input',
                        name: this.verificaVazio(elemento.getAttribute('name')),
                        isComponent: true
                    });
                    this.xmlSite += `\t\t\t<component type="input" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="focus" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="blur" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="change" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="empty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notEmpty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="readOnly" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                } else if (checks.indexOf(tipo) != -1) {
                    const typeName = tipo === 'checkbox' ? 'check' : 'radio';
                    this.componentMap.set(dom_id, {
                        itemId: this.numComponente,
                        type: typeName,
                        name: this.verificaVazio(elemento.getAttribute('name')),
                        isComponent: true
                    });
                    this.xmlSite += `\t\t\t<component type="${typeName}" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                    this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                    this.numEvento++;
                    this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="notChecked" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += `\t\t\t\t<state name="checked" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                    this.numState++;
                    this.xmlSite += '\t\t\t</component>\n';
                    this.numComponente++;
                }
                break;

            case 'textarea':
                this.componentMap.set(dom_id, {
                    itemId: this.numComponente,
                    type: 'input',
                    name: this.verificaVazio(elemento.getAttribute('name')),
                    isComponent: true
                });
                this.xmlSite += `\t\t\t<component type="input" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                this.xmlSite += `\t\t\t\t<event name="focus" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="blur" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="change" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<state name="empty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="notEmpty" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="readOnly" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += '\t\t\t</component>\n';
                this.numComponente++;
                break;

            case 'select':
                this.componentMap.set(dom_id, {
                    itemId: this.numComponente,
                    type: 'select',
                    name: this.verificaVazio(elemento.getAttribute('name')),
                    isComponent: true
                });
                this.xmlSite += `\t\t\t<component type="select" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                this.xmlSite += `\t\t\t\t<event name="focus" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="blur" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="change" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<state name="notDefault" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="default" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="disabled" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += '\t\t\t</component>\n';
                this.numComponente++;
                break;

            case 'button':
                this.componentMap.set(dom_id, {
                    itemId: this.numComponente,
                    type: 'button',
                    name: this.verificaVazio(elemento.getAttribute('name')),
                    isComponent: true
                });
                this.xmlSite += `\t\t\t<component type="button" dom_id="${dom_id}" node_id="${this.numPagina}" item_id="${this.numComponente}" name="${this.verificaVazio(elemento.getAttribute('name'))}">\n`;
                this.xmlSite += `\t\t\t\t<event name="click" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<event name="enter" node_id="${this.numPagina}" item_id="${this.numComponente}" event_id="${this.numEvento}"></event>\n`;
                this.numEvento++;
                this.xmlSite += `\t\t\t\t<state name="selected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += `\t\t\t\t<state name="notselected" node_id="${this.numPagina}" item_id="${this.numComponente}" state_id="${this.numState}"></state>\n`;
                this.numState++;
                this.xmlSite += '\t\t\t</component>\n';
                this.numComponente++;
                break;
        }
    }

    geraEstruturaDOM(){
        this.percorreNo(document.body, 1);
    }

    percorreNo(elemento, nivel){
        if(!elemento || elemento.nodeType !== 1) return;

        const tag = elemento.tagName.toLowerCase();
        const ident = '\t'.repeat(nivel + 1); // identação

        const tagsEstruturais = ['div', 'section', 'header', 'nav', 'ul', 'li', 'article', 'form', 'p', 'span'];
        // Verifica se o elemento atual foi mapeado como um componente completo
        const componentInfo = this.componentMap.get(this.DOM.indexOf(elemento));
        // Se for um componente adiciona no xmlStructure
        if(componentInfo && componentInfo.isComponent) {
            this.xmlStructure += `${ident}<node name="component" id="${elemento.id}" class="${elemento.className}" type="${componentInfo.type}" dom_id="${this.DOM.indexOf(elemento)}" node_id="${this.numPagina}" item_id="${componentInfo.itemId}" externo="${componentInfo.externo || 'undefined'}" str_id="${this.numComponente++}"></node>\n`;
            return;
        }

        // Se for uma tag estrutural, cria um nó estrutural
        if(tagsEstruturais.includes(tag) || tag === 'body'){
            if(tag === 'body'){
                this.xmlStructure += `${ident}<page url="${this.escapeXML(window.location.href)}" titulo="${this.escapeXML(document.title)}" node_id="${this.numPagina}" index="${this.index === 'true' ? 'true' : 'false'}"> \n`;
            } else {
                this.xmlStructure += `${ident}<node name="${tag}" class="${elemento.className}" id="${elemento.id}" node_id="${this.numPagina}" type="" item_id="" str_id="${this.numComponente++}">\n`;
            }

            for(const filho of elemento.children){
                this.percorreNo(filho, nivel + 1);
            }

            if(tag === 'body'){
                this.xmlStructure += `${ident}</page>\n`;
            } else {
                this.xmlStructure += `${ident}</node>\n`;
            }
        }
    }

    verificaVazio(texto) {
        if (texto !== undefined && texto !== null) {
            const filter = /^(?!\s*$).+/;
            if (!filter.test(texto)) {
                return "";
            } else {
                return texto.replace(/&/g, "&amp;")
                       .replace(/</g, "&lt;")
                       .replace(/>/g, "&gt;")
                       .replace(/"/g, "&quot;")
                       .replace(/'/g, "&apos;");
            }
        } else {
            return '';
        }
    }

    checkMedia(url) {
        try {
            const urlObj = new URL(url, window.location.href);
            const path = urlObj.pathname.toLowerCase();
            return path.match(/\.(jpeg|jpg|gif|png|mp3|svg|mp4|avi|pdf|doc|docx|xls|xlsx|ppt|pptx)$/) !== null;
        } catch (e) {
            return false;
        }
    }

    adicionaLinkAcessado(linkU) {
        const normalizedUrl = this.normalizeLinkUrl(linkU);
        if (!this.verificaLinkAcessado(normalizedUrl)) {
            this.linksAcessados.push(normalizedUrl);
        }
    }

    verificaLinkAcessado(linkU) {
        const normalizedUrl = this.normalizeLinkUrl(linkU);
        return this.linksAcessados.some(link => 
            this.normalizeLinkUrl(link) === normalizedUrl
        );
    }

    async acessaProximoLink() {
        console.log("Buscando próximo link...");
        console.log("Links por pai:", this.linksPorPai);
        console.log("Links acessados:", this.linksAcessados);

        let proximoLink = '';
        let linkInfoCompleto = null;

        // Acessa os links das páginas mapeadas
        for (const page of this.linksPorPai) {
            // Verifica se há links naquela página
            if (page.links) {
                for (const linkInfo of page.links) {
                    // Verifica se o link não foi acessado ainda
                    if (!this.verificaLinkAcessado(linkInfo.link)) {
                        proximoLink = linkInfo.link;
                        linkInfoCompleto = linkInfo;
                        console.log("Próximo link encontrado:", proximoLink);
                        break;
                    }
                }
            }
            if (proximoLink) break;
        }

        if (proximoLink) {
            console.log("Navegando para:", proximoLink);
            this.numPagina++;
            this.adicionaLinkAcessado(proximoLink);
            this.mostrarStatus(`Acessando Link: ${proximoLink}`);

            // Salvar estado atual antes de navegar
            await chrome.storage.local.set({
                crawlerState: this.getCurrentState(),
                isCrawling: true
            }, () => {
                console.log("WebCrawler. Método: acessaProximoLink");
                console.log("Enviando mensagem ao background: abreLink");
                chrome.runtime.sendMessage({
                    action: "abreLink",
                    url: proximoLink,
                    crawlerState: this.getCurrentState()
                });
            });
        } else {
            console.log("Nenhum próximo link encontrado, finalizando...");
            this.finalizaCrawler();
        }
    }

    mostrarStatus(mensagem) {
        document.querySelector('.crawlerLiviaStatus')?.remove();
        const statusDiv = document.createElement('div');
        statusDiv.className = 'crawlerLiviaStatus';
        statusDiv.style.cssText = 'position: fixed; left: 15px; top: 15px; z-index:99999999999999; ' +
            'background-color: #000; width: 300px; padding: 20px; color: #fff; ' +
            'font-size: 15px; font-family: Arial, sans-serif; text-align: center;';
        statusDiv.textContent = mensagem;
        document.body.appendChild(statusDiv);
    }

    normalizeLinkUrl(url){
        if (!url) return '';
    
        try {
            // Converter para URL absoluta
            const urlObj = new URL(url, window.location.href);
            let normalized = urlObj.href;

            normalized = normalized.split('#')[0];
            normalized = normalized.split('?')[0];
            normalized = normalized.replace(/index\.html$/i, '');
            normalized = normalized.replace(/index\.html\//i, '');
            normalized = normalized.replace(/index\.php\//i, '');
            normalized = normalized.replace(/index\.php$/i, '');
            normalized = normalized.replace(/index\.asp$/i, '');
            normalized = normalized.replace(/index\.asp\//i, '');
            normalized = normalized.replace(/\/$/, '');
            
            return normalized;
        } catch (e) {
            console.warn('Erro ao normalizar URL:', url, e);
            // Fallback
            return url.split('?')[0].split('#')[0]
                .replace(/index\.html$/i, '')
                .replace(/index\.html\//i, '')
                .replace(/index\.php\//i, '')
                .replace(/index\.php$/i, '')
                .replace(/index\.asp$/i, '')
                .replace(/index\.asp\//i, '')
                .replace(/\/$/, '');
        }
    }

    fecharPaginaAtual(){
        if(this.isPaginaFechada) return;
        // Conta quantas tags <page> abertas vs fechadas
        const pageOpenCount = (this.xmlSite.match(/<page /g) || []).length;
        const pageCloseConunt = (this.xmlSite.match(/<\/page>/g) || []).length;

        // Fecha todas as páginas abertas não fechadas
        for(let i = pageCloseConunt; i < pageOpenCount; i++){
            this.xmlSite += '\t\t</page>\n\n';
        }
        this.isPaginaFechada = true;
    }

    finalizaCrawler() {
        // Fechamento da página atual se ainda estiver aberta
        this.fecharPaginaAtual();

        // Limpar timeout de segurança
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        // Fecha a seção de páginas
        this.xmlSite += '\t</pages>\n\n';

        // Iniciar a seção de edges com contador
        this.xmlSite += '\t<edges>\n';

        // Gerar edges (conexões entre páginas)
        this.linksPorPai.forEach(page => {
            if (page.links) {
                page.links.forEach(linkInfo => {
                    // Verificar se o link foi acessado e encontrar o ID da página destino
                    const normalizedLink = this.normalizeLinkUrl(linkInfo.link);
                    const targetPageId = this.linksAcessados.findIndex(link => 
                        this.normalizeLinkUrl(link) === normalizedLink
                    ) + 1;
                    
                    if (targetPageId > 0 && linkInfo.evento && linkInfo.evento2) {
                        // Formato COMPATÍVEL com a estrutura especificada
                        this.xmlSite += `\t\t<edge ed_id="${this.numEdge}" source="${page.id}" target="${targetPageId}" ref_item_id="${linkInfo.componente}">\n`;
                        this.xmlSite += `\t\t\t<data event_id="${linkInfo.evento}">click</data>\n`;
                        this.xmlSite += `\t\t\t<data event_id="${linkInfo.evento2}">enter</data>\n`;
                        this.xmlSite += '\t\t</edge>\n';
                        this.numEdge++;
                    }
                });
            }
        });

        this.xmlSite += '\t</edges>\n\n';
        this.xmlSite += '\t<structure>\n';
        this.xmlSite += this.xmlStructure;
        this.xmlSite += '\t</structure>\n\n';
        this.xmlSite += this.xmlStructure;
        this.xmlSite += '</site>\n';

        this.salvarXML();
    }

    salvarXML() {
        try {
            const blob = new Blob([this.xmlSite], { type: "text/xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'site-map.xml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // Limpar o objeto URL para liberar memória
            setTimeout(() => URL.revokeObjectURL(url), 100);

            // Notificar o background que o crawler terminou
            console.log("WebCrawler. Método: salvarXML");
            console.log("Enviando mensagem ao background - resetaCrawler");
            chrome.runtime.sendMessage({ action: "resetCrawler" });
        } catch (error) {
            console.error('Erro ao salvar XML:', error);
        }

    }
}

// Torna o escopo da classe global
window.WebCrawler = WebCrawler;