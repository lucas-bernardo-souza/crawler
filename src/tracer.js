class WebTracer {
    constructor() {
        this.gravando = false;
        this.xmlTracer = '';
        this.xmlFinalTracer = '';
        this.xmlInteracoes = '';
        this.numInteracoes = 1;
        this.tempoInteracao = 0;
        this.domAtual = '';
        this.xmlJquery = null;
        this.domain = new URL(window.location.href).hostname;
        
        this.initializeFromStorage();
    }

    getCurrentState() {
        return {
            xmlFinalTracer: this.xmlFinalTracer,
            xmlInteracoes: this.xmlInteracoes,
            gravando: this.gravando,
            xmlTracer: this.xmlTracer,
            numInteracoes: this.numInteracoes,
            tempoInteracao: this.tempoInteracao
        };
    }
    // ========================

    async initializeFromStorage() {
        try {
            const result = await chrome.storage.local.get([
                'xmlFinalTracer', 'xmlInteracoes', 'gravando',
                'xmlTracer', 'numInteracoes', 'tempoInteracao'
            ]);

            if (result.xmlFinalTracer) {
                this.xmlFinalTracer = result.xmlFinalTracer;
                this.xmlInteracoes = result.xmlInteracoes;
                this.gravando = result.gravando;
                this.xmlTracer = result.xmlTracer;
                this.numInteracoes = result.numInteracoes;
                this.tempoInteracao = result.tempoInteracao;

                if (this.gravando) {
                    this.continuaTracer();
                }
            }
        } catch (error) {
            console.error('Erro ao inicializar tracer do storage:', error);
        }
    }

    initializeState(state){
        if(!state) return;

        console.log("Tracer: Inicializando estado a partir dos dados recebidos");
        this.xmlFinalTracer = state.xmlFinalTracer || '';
        this.xmlInteracoes = state.xmlInteracoes || '';
        this.gravando = state.gravando || false;
        this.xmlTracer = state.xmlTracer || '';
        this.numInteracoes = state.numInteracoes || 1;
        this.tempoInteracao = state.tempoInteracao || 0;
    }

    iniciaTracer(tabid) {
        console.log("WebTracer: Iniciando o processo de gravação...");
        try{

            console.log("WebTracer: Conteúdo do XML recebido (primeiros 500 caracteres):", this.xmlTracer.substring(0, 500));

            if (!this.xmlTracer || this.xmlTracer.trim() === '') {
                alert("Erro Crítico: O Tracer recebeu um mapa do site (XML) vazio. A gravação não pode começar.");
                throw new Error("O xmlTracer está vazio ou nulo.");
            }

            
            this.domAtual = document.body.innerHTML;
            const urlMapa = window.location.href;
            const titulo = document.title;

            // Parse do XML do crawler
            const parser = new DOMParser();
            this.xmlJquery = parser.parseFromString(this.xmlTracer, "text/xml");

            // Verificar se o parsing foi bem-sucedido
            const parseError = this.xmlJquery.querySelector('parsererror');
            if (parseError) {
                console.error('Erro no parsing do XML:', parseError.textContent);
                throw new Error('XML inválido ou mal formado');
            }

            this.xmlFinalTracer = '<?xml version="1.0" encoding="UTF-8"?>\n';
            this.xmlFinalTracer += `<site url="${urlMapa}" titulo="${titulo}" tipo="tracer">\n`;
            this.xmlFinalTracer += '\t<pages>\n';
            
            /*
            // Utilização de Regex
            //const pagesMatch = this.xmlTracer.match(/<pages>([\s\S]*?)<\/pages>/);
            if (pagesMatch && pagesMatch[1]) {
                this.xmlFinalTracer += pagesMatch[1];
            } else {
                console.error('Não foi possível extrair a seção pages do XML');
                this.xmlFinalTracer += '\t\t<!-- Erro: seção pages não encontrada no XML -->\n';
            }
            */

            // Utilização do objeto XML
            const pagesNode = this.xmlJquery.querySelector('pages');
            if(pagesNode){
                // Obtendo o conteúdo das tags <page>
                this.xmlFinalTracer += pagesNode.innerHTML;
            } else {
                console.error('Não foi possível encontrar a seção <pages> no XML');
                this.xmlFinalTracer += '\t\t\n';
            }

            this.xmlFinalTracer += '\t</pages>\n';

            this.xmlInteracoes = '\t<interactions>\n';
            this.monitorarEventos();

        } catch (error){
            console.error('Erro ao iniciar tracer:', error);
            this.gravando = false;
        }
    }

    continuaTracer() {
        this.domAtual = document.body.innerHTML;
        const parser = new DOMParser();
        this.xmlJquery = parser.parseFromString(this.xmlTracer, "text/xml");
        this.monitorarEventos();
    }

    monitorarEventos() {
        this.atualizaDinamicos();

        // Monitorar clicks em links
        document.body.addEventListener('click', (e) => {
            this.handleClickEvent(e);
        });

        // Monitorar eventos de teclado
        document.body.addEventListener('keypress', (e) => {
            this.handleKeypressEvent(e);
        });

        // Monitorar mudanças em formulários
        document.body.addEventListener('change', (e) => {
            this.handleChangeEvent(e);
        });
    }

    handleClickEvent(e) {
        const elemento = e.target;
        const tagName = elemento.tagName.toLowerCase();
        const timeStamp = Math.floor(e.timeStamp);

        if (tagName === 'a') {
            this.handleLinkClick(elemento, e, timeStamp);
        } else if (tagName === 'input') {
            this.handleInputClick(elemento, e, timeStamp);
        } else if (tagName === 'button') {
            this.handleButtonClick(elemento, timeStamp, 'click');
        }
    }

    handleLinkClick(elemento, e, timeStamp) {
        const url = elemento.href;
        if (!url) return;

        e.preventDefault();
        e.stopPropagation();

        const isExterno = new URL(url).hostname !== this.domain;

        if (!isExterno) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                url,
                timeStamp,
                'page',
                'click'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado(() => {
                window.location.href = url;
            });
        } else {
            if (confirm('Este link te levará para fora da página e encerrará o tracer. Tem certeza que deseja encerrá-lo?')) {
                this.insereInteracoes(
                    Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                    url,
                    timeStamp,
                    'page',
                    'click'
                );

                this.tempoInteracao = timeStamp;
                this.salvarEstado(() => {
                    this.salvarXMLTracer();
                });
            }
        }
    }

    handleInputClick(elemento, e, timeStamp) {
        const tipo = elemento.type.toLowerCase();

        if (['button', 'reset', 'submit', 'image'].includes(tipo)) {
            this.handleButtonClick(elemento, timeStamp, 'click');
        } else if (['checkbox', 'radio'].includes(tipo)) {
            this.handleCheckboxRadioClick(elemento, timeStamp, 'click');
        }
    }

    handleButtonClick(elemento, timeStamp, evento) {
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            'button',
            evento
        );

        this.tempoInteracao = timeStamp;
        this.salvarEstado();
    }

    handleCheckboxRadioClick(elemento, timeStamp, evento) {
        const tipo = elemento.type.toLowerCase();
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            tipo,
            evento
        );

        this.tempoInteracao = timeStamp;
        this.salvarEstado();
    }

    handleKeypressEvent(e) {
        if (e.key === 'Enter') {
            const elemento = e.target;
            const tagName = elemento.tagName.toLowerCase();
            const timeStamp = Math.floor(e.timeStamp);

            if (tagName === 'a') {
                this.handleLinkEnter(elemento, e, timeStamp);
            } else if (tagName === 'input') {
                this.handleInputEnter(elemento, timeStamp);
            } else if (tagName === 'button') {
                this.handleButtonClick(elemento, timeStamp, 'enter');
            }
        }
    }

    handleLinkEnter(elemento, e, timeStamp) {
        const url = elemento.href;
        if (!url) return;

        e.preventDefault();
        e.stopPropagation();

        const isExterno = new URL(url).hostname !== this.domain;

        if (!isExterno) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                url,
                timeStamp,
                'page',
                'enter'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado(() => {
                window.location.href = url;
            });
        }
    }

    handleInputEnter(elemento, timeStamp) {
        const tipo = elemento.type.toLowerCase();

        if (['button', 'reset', 'submit', 'image'].includes(tipo)) {
            this.handleButtonClick(elemento, timeStamp, 'enter');
        }
    }

    handleChangeEvent(e) {
        const elemento = e.target;
        const tagName = elemento.tagName.toLowerCase();
        const timeStamp = Math.floor(e.timeStamp);

        if (['input', 'textarea', 'select'].includes(tagName)) {
            this.insereInteracoes(
                Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                '',
                timeStamp,
                tagName,
                'change'
            );

            this.tempoInteracao = timeStamp;
            this.salvarEstado();
        }
    }

    insereInteracoes(domId, url, tempo, tipo, evento) {
        console.log('Interação registrada:', { domId, url, tempo, tipo, evento });

        if (tipo === 'page') {
            this.handlePageInteraction(domId, url,tempo, evento);
        } else if(tipo === 'button'){
            this.handleButtonInteraction(domId, tempo, evento);
        } else if(tipo === 'input'){
            this.handleInputInteraction(domId, tempo, evento);
        } else if(tipo === 'check'){
            this.handleCheckInteraction(domId, tempo, evento);
        } else if(tipo === 'radio'){
            this.handleRadioInteraction(domId, tempo, evento);
        } else if(tipo === 'select'){
            this.handleSelectInteraction(domId, tempo, evento);
        }
    }

    // Método auxiliar ao insereInteracoes
    normalizeUrl(url){
        if(!url) return '';

        try{
            const urlObj = new URL(url, window.location.href);
            let normalized = urlObj.origin + urlObj.pathname;

            normalized = normalized.replace(/index\.(html|php|asp)$/i, '');
            normalized = normalized.replace(/\/$/, '');
            normalized = normalized.split('?')[0].split('#')[0];

            return normalized;
        } catch (e){
            console.warn('Erro ao normalizar URL:', url, e);
            // Fallback
            try {
                return url.split('?')[0].split('#')[0]
                        .replace(/index\.(html|php|asp)/gi, '')
                        .replace(/\/$/, '');
            } catch (error) {
                return url;
            }
        }
    }

    handlePageInteraction(domId, url, tempo, evento){
        let idIniStateLink = 0;
        let idFinalStateLink = 0;
        let idSrcEvent = 0;
        let idSrcPage = 0;
        let idTargetPage = 0;
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let sourceID = 0;
        const urlMapa = this.normalizeUrl(window.location.href);

        url = this.normalizeUrl(url);

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            const pageUrl = page.getAttribute('url');
            
            if (this.normalizeUrl(pageUrl) === this.normalizeUrl(url)) {
                idTargetPage = page.getAttribute('node_id');
                
                // Buscar estados e eventos da página target
                const states = page.querySelectorAll('state');
                const events = page.querySelectorAll('event');
                
                for (const state of states) {
                    const stateName = state.getAttribute('name');
                    const itemId = state.getAttribute('item_id');
                    
                    if(itemId === 'null'){
                        if (stateName === 'onLoad') {
                            idIniState = state.getAttribute('state_id');
                        } else if (stateName === 'Load') {
                            idFimState = state.getAttribute('state_id');
                        }
                    }  
                }
                
                for (const event of events) {
                    const itemId = event.getAttribute('item_id');
                    if (itemId === 'null' && event.getAttribute('name') === 'onLoad') {
                        idTargetEvent = event.getAttribute('event_id');
                    }
                }
            }
            
            if (this.normalizeUrl(pageUrl) === this.normalizeUrl(urlMapa)) {
                idSrcPage = page.getAttribute('node_id');
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        sourceID = component.getAttribute('item_id');
                        
                        // Buscar eventos do componente
                        const compEvents = component.querySelectorAll('event');
                        for (const event of compEvents) {
                            if (event.getAttribute('name') === evento) {
                                idSrcEvent = event.getAttribute('event_id');
                            }
                        }
                        
                        // Buscar estados do componente
                        const compStates = component.querySelectorAll('state');
                        for (const state of compStates) {
                            const stateName = state.getAttribute('name');
                            if (stateName === 'visited') {
                                idFinalStateLink = state.getAttribute('state_id');
                            } else if (stateName === 'not visited') {
                                idIniStateLink = state.getAttribute('state_id');
                            }
                        }
                    }
                }
            }
        }

        // Gerar interações
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniStateLink}" finalState="${idFinalStateLink}" event_source="" event_target="${idSrcEvent}" source_id="${sourceID}" type_source="component" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idSrcEvent}" event_target="${idTargetEvent}" source_id="${idTargetPage}" type_source="page" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo + 50}</interaction>\n`;
        this.numInteracoes++;
    }

    // Método auxiliar a interacao com button (insereInteracoes)
    handleButtonInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);

        const pages = this.xmlJquery.querySelectorAll('pages page');

        for(const page of pages){
            if(this.normalizeUrl(page.getAttribute('url')) === urlMapa){
                const components = page.querySelectorAll('component');

                for(const component of components){
                    if(parseInt(component.getAttribute('dom_id')) === domId){
                        idTarget = component.getAttribute('item_id');

                        // Buscar estados
                        const states = component.querySelectorAll('state');
                        for(const state of states){
                            const stateName = state.getAttribute('name');
                            if(stateName === 'selected'){
                                idFimState = state.getAttribute('state_id');
                            } else if (stateName === 'notselected') {
                                idIniState = state.getAttribute('state_id');
                            }
                        }

                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for(const event of events){
                            if(event.getAttribute('name') === evento){
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }

        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou button');
    }

    // Metodo auxiliar a interação com o input 
    // (usado no método insereInteracoes)
    handleInputInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento ? elemento.value : '';
        const pages = this.xmlJquery.querySelectorAll('pages page');

        for(const page of pages){
            if(page.getAttribute('url') === urlMapa){
                const components = page.querySelectorAll('component');

                for(const component of components){
                    if(parseInt(component.getAttribute('dom_id'))===domId){
                        idTarget = component.getAttribute('item_id');

                        //Buscar estados baseado no valor
                        const states = component.querySelectorAll('state');
                        const stateName = valor === '' ? 'empty' : 'notEmpty';

                        for(const state of states){
                            if(state.getAttribute('name') === stateName){
                                idFimState = state.getAttribute('state_id');
                                idIniState = state.getAttribute('state_id');
                            }
                        }

                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for(const event of events){
                            if(event.getAttribute('name') === evento){
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou input');
    }

    handleCheckInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter estado do checkbox diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        //const valor = elemento && elemento.checked !== undefined ? elemento.checked : false;
        const estaMarcado = elemento ? elemento.checked : false;

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (this.normalizeUrl(page.getAttribute('url')) === urlMapa) {
                
                //const components = page.querySelectorAll('component');
                const components = page.querySelectorAll('component[type="check"]');

                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor checked
                        const states = component.querySelectorAll('state');
                        
                        for (const state of states) {
                            const stateName = state.getAttribute('name');
                            // antes valor === true
                            if (estaMarcado) {
                                if (stateName === 'notChecked') {
                                    //idFimState = state.getAttribute('state_id');
                                    idIniState = state.getAttribute('state_id');
                                } else if (stateName === 'checked') {
                                    //idIniState = state.getAttribute('state_id');
                                    idFimState = state.getAttribute('state_id');
                                }
                            } else {
                                if (stateName === 'checked') {
                                    //idFimState = state.getAttribute('state_id');
                                    idIniState = state.getAttribute('state_id');
                                } else if (stateName === 'notChecked') {
                                    //idIniState = state.getAttribute('state_id');
                                    idFimState = state.getAttribute('state_id');
                                }
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou checkbox');
    }

    handleRadioInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter estado do radio diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        //const valor = elemento && elemento.checked !== undefined ? elemento.checked : false;
        const estaMarcado = elemento ? elemento.checked : false;

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (this.normalizeUrl(page.getAttribute('url')) === urlMapa) {
                const components = page.querySelectorAll('component[type="radio"]');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor checked
                        const states = component.querySelectorAll('state');
                        
                        for (const state of states) {
                            const stateName = state.getAttribute('name');
                            if (estaMarcado) {
                                if (stateName === 'notChecked') {
                                    idIniState = state.getAttribute('state_id');
                                } else if (stateName === 'checked') {
                                    idFimState = state.getAttribute('state_id');
                                }
                            } else {
                                if (stateName === 'checked') {
                                    idIniState = state.getAttribute('state_id');
                                } else if (stateName === 'notChecked') {
                                    idFimState = state.getAttribute('state_id');
                                }
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou radio');
    }

    handleSelectInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.normalizeUrl(window.location.href);
        
        // Obter valor do select diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento && elemento.value ? elemento.value : '';

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (page.getAttribute('url') === urlMapa) {
                const components = page.querySelectorAll('component');
                
                for (const component of components) {
                    if (parseInt(component.getAttribute('dom_id')) === domId) {
                        idTarget = component.getAttribute('item_id');
                        
                        // Buscar estados baseado no valor
                        const states = component.querySelectorAll('state');
                        const stateName = valor === '' ? 'default' : 'notDefault';
                        
                        for (const state of states) {
                            if (state.getAttribute('name') === stateName) {
                                idFimState = state.getAttribute('state_id');
                                idIniState = state.getAttribute('state_id');
                            }
                        }
                        
                        // Buscar eventos
                        const events = component.querySelectorAll('event');
                        for (const event of events) {
                            if (event.getAttribute('name') === evento) {
                                idTargetEvent = event.getAttribute('event_id');
                            }
                        }
                    }
                }
            }
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        console.log('monitorou select');
    }

    atualizaDinamicos() {
        // Atualiza estado dos elementos dinâmicos
        const inputs = document.querySelectorAll('input, select, textarea, button');
        this.inputsAtuais = Array.from(inputs).map(input => ({
            elemento: input,
            value: input.value,
            checked: input.checked,
            disabled: input.disabled,
            readOnly: input.readOnly
        }));

        const iframes = document.querySelectorAll('iframe');
        this.iframesAtuais = Array.from(iframes).map(iframe => ({
            elemento: iframe,
            src: iframe.src,
            html: iframe.contentDocument?.documentElement.outerHTML || ''
        }));
    }

    async salvarEstado(callback = null) {
            try {
                await chrome.storage.local.set({
                    xmlFinalTracer: this.xmlFinalTracer,
                    xmlInteracoes: this.xmlInteracoes,
                    gravando: this.gravando,
                    xmlTracer: this.xmlTracer,
                    numInteracoes: this.numInteracoes,
                    tempoInteracao: this.tempoInteracao
                });

                if (callback) callback();
            } catch (error) {
                console.error('Erro ao salvar estado:', error);
            }
    }

    salvarXMLTracer() {
        this.xmlFinalTracer += this.xmlInteracoes;
        this.xmlFinalTracer += '\t</interactions>\n';
        this.xmlFinalTracer += '</site>\n';

        const blob = new Blob([this.xmlFinalTracer], { type: "text/xml" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = "mapa-tracer.xml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        URL.revokeObjectURL(url);

        // Resetar estado
        this.gravando = false;
        this.xmlTracer = '';
        this.xmlFinalTracer = '';
        this.xmlInteracoes = '';
        this.numInteracoes = 1;
        this.tempoInteracao = 0;

        this.salvarEstado();
    }
}

// Torna o escopo da classe global
window.WebTracer = WebTracer;