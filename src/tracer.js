class WebTracer {
    constructor() {
        this.gravando = false;
        this.encerrando = false;
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

    async initializeFromStorage() {
        try {
            const result = await chrome.storage.local.get([
                'xmlFinalTracer', 'xmlInteracoes', 'gravando',
                'xmlTracer', 'numInteracoes', 'tempoInteracao', 'tracerState'
            ]);

            const source = result.tracerState || result;

            if (source.xmlFinalTracer) {
                this.xmlFinalTracer = source.xmlFinalTracer;
                this.xmlInteracoes = source.xmlInteracoes;
                this.gravando = source.gravando;
                this.xmlTracer = source.xmlTracer;
                this.numInteracoes = source.numInteracoes;
                this.tempoInteracao = source.tempoInteracao;
                
                console.log("Estado restaurado do storage:", {
                    xmlFinalTracerLength: this.xmlFinalTracer.length,
                    xmlInteracoesLength: this.xmlInteracoes.length,
                    gravando: this.gravando
                });
            }
        } catch (error) {
            console.error('Erro ao inicializar tracer do storage:', error);
        }
    }

    initializeState(state){
        if(!state) return;

        console.log("Tracer: Inicializando estado a partir dos dados recebidos");
        console.log("Tracer: Dados xmlFinalTracer:", state.xmlFinalTracer);
        this.xmlFinalTracer = state.xmlFinalTracer || '';
        this.xmlInteracoes = state.xmlInteracoes || '';
        this.gravando = state.gravando || false;
        this.xmlTracer = state.xmlTracer || '';
        this.numInteracoes = state.numInteracoes || 1;
        this.tempoInteracao = state.tempoInteracao || 0;
    }

    escapeXml(unsafe) {
        if (!unsafe) return '';

        let safeString = unsafe.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g, '');
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    // Limpa textos antes de incluí-los no XML
    sanitizeText(text) {
        if (!text) return '';
        
        // Remove caracteres problemáticos antes de processar
        return text
            .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g, '')
            .replace(/[\uD83E\uDC06]/g, '')
            .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
            .trim();
    }

    async iniciaTracer() {
        try{
            if (!this.xmlTracer || this.xmlTracer.trim() === '') {
                alert("Erro Crítico: O Tracer recebeu um mapa do site (XML) vazio. A gravação não pode começar.");
                throw new Error("O xmlTracer está vazio ou nulo.");
            }

            
            if(this.xmlFinalTracer.trim() === ''){
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

                const pagesNode = this.xmlJquery.querySelector('pages');
                const edgesNode = this.xmlJquery.querySelector('edges');
                const structureNode = this.xmlJquery.querySelector('structure');

                if(!pagesNode){
                    console.error('Não foi possível encontrar a seção <pages> no XML');
                    throw new Error('XML inválido, <pages> não encontrado');
                }

                this.xmlFinalTracer = '<?xml version="1.0" encoding="UTF-8"?>\n';
                this.xmlFinalTracer += `<site url="${this.escapeXml(urlMapa)}" titulo="${this.escapeXml(titulo)}" tipo="tracer">\n`;
                this.xmlFinalTracer += '\t' + pagesNode.outerHTML + '\n';

                if(edgesNode){
                    this.xmlFinalTracer += '\t' + edgesNode.outerHTML + '\n';
                } else {
                    console.warn('Nó <edges> não encontrado no XML do crawler.');
                    this.xmlFinalTracer += '\t<edges></edges>\n'; // Adiciona um vazio para manter a estrutura
                }

                if(structureNode){
                    this.xmlFinalTracer += '\t' + structureNode.outerHTML + '\n';
                } else {
                    console.warn('Nó <structure> não encontrado no XML do crawler.');
                    this.xmlFinalTracer += '\t<structure></structure>\n'; // Adiciona um vazio
                }

                this.xmlInteracoes = '\t<interactions>\n';
            }
            this.gravando = true;

            await this.salvarEstado();

            this.monitorarEventos();
        } catch (error){
            console.error('Erro ao iniciar tracer:', error);
            this.gravando = false;
        }
    }

    async continuaTracer() {
        try {
            await this.initializeFromStorage();
        } catch (e){
            console.warn('continuaTracer: falha ao restaurar do storage, prosseguindo com estado atual', e);
        }

        this.domAtual = document.body.innerHTML;

        if(!this.xmlJquery){
            if(!this.xmlTracer || this.xmlTracer.trim() === ''){
                console.warn('continuaTracer: xmlTracer vazio, não é possível continuar o monitoramento.');
                return;
            }
            const parser = new DOMParser();
            this.xmlJquery = parser.parseFromString(this.xmlTracer, 'text/xml');
        }
        this.monitorarEventos();
    }

    monitorarEventos() {
        this.atualizaDinamicos();

        this.handleClickEventBound = this.handleClickEvent.bind(this);
        this.handleKeypressEventBound = this.handleKeypressEvent.bind(this);
        this.handleChangeEventBound = this.handleChangeEvent.bind(this);

        document.body.addEventListener('click', this.handleClickEventBound);
        document.body.addEventListener('keypress', this.handleKeypressEventBound);
        document.body.addEventListener('change', this.handleChangeEventBound);
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

    async handleLinkClick(elemento, e, timeStamp) {
        if(this.encerrando){
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
            if(await this.salvarEstado()){
                window.location.href = url;
            }
        } else {
            this.encerrando = true;
            this.removerEventos();

            if (confirm('Este link te levará para fora da página e encerrará o tracer. Tem certeza que deseja encerrá-lo?')) {
                // 1. Registra a última interação (o clique no link externo)
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
                    setTimeout(() => {
                        window.location.href = url;
                    }, 1000);
                });
            } else {
                // Se o usuário cancelar, o tracer é reativado
                this.encerrando =  false;
                this.monitorarEventos();
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

    async handleButtonClick(elemento, timeStamp, evento) {
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            'button',
            evento
        );

        this.tempoInteracao = timeStamp;
        await this.salvarEstado();
    }

    async handleCheckboxRadioClick(elemento, timeStamp, evento) {
        const tipo = elemento.type.toLowerCase();
        this.insereInteracoes(
            Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
            '',
            timeStamp,
            tipo,
            evento
        );

        this.tempoInteracao = timeStamp;
        await this.salvarEstado();
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

    async handleLinkEnter(elemento, e, timeStamp) {
        if(this.encerrando){
            e.preventDefault();
            e.stopPropagation();
            return;
        }

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
            if(await this.salvarEstado()){
                window.location.href = url;
            }
        } else {
            this.encerrando = true;
            this.removerEventos();
            if (confirm('Este link te levará para fora da página e encerrará o tracer. Tem certeza que deseja encerrá-lo?')) {
                this.insereInteracoes(
                    Array.from(document.body.querySelectorAll('*')).indexOf(elemento),
                    url,
                    timeStamp,
                    'page',
                    'enter'
                );

                this.tempoInteracao = timeStamp;
                await this.salvarEstado(() => {
                    this.salvarXMLTracer();
                    setTimeout(() => {
                        window.location.href = url;
                    }, 1000);
                });
            } else {
                this.encerrando = false;
                this.monitorarEventos();
            }
        }
    }

    handleInputEnter(elemento, timeStamp) {
        const tipo = elemento.type.toLowerCase();

        if (['button', 'reset', 'submit', 'image'].includes(tipo)) {
            this.handleButtonClick(elemento, timeStamp, 'enter');
        }
    }

    async handleChangeEvent(e) {
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
            await this.salvarEstado();
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
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));

        url = this.sanitizeText(this.normalizeUrl(url));

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

        if(idTargetPage === 0){
            return;
        }

        // Gerar interações
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniStateLink}" finalState="${idFinalStateLink}" event_source="" event_target="${idSrcEvent}" source_id="${sourceID}" type_source="component" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idSrcEvent}" event_target="${idTargetEvent}" source_id="${idTargetPage}" type_source="page" target_id="${idTargetPage}" type_target="page">${this.tempoInteracao + tempo + 50}</interaction>\n`;
        this.numInteracoes++;
    }

    // Método auxiliar a interacao com button (insereInteracoes)
    async handleButtonInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));

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

        if(idTarget === 0){
            return;
        }

        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;

        await this.salvarEstado();
        console.log('monitorou button');
    }

    // Metodo auxiliar a interação com o input 
    // (usado no método insereInteracoes)
    async handleInputInteraction(domId, tempo, evento){
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento ? elemento.value : '';
        const pages = this.xmlJquery.querySelectorAll('pages page');

        for(const page of pages){
            if(this.normalizeUrl(page.getAttribute('url')) === urlMapa){
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

        if(idTarget === 0){
            return;
        }

        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        await this.salvarEstado();
        console.log('monitorou input');
    }

    async handleCheckInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));
        
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

        if(idTarget === 0){
            return;
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        await this.salvarEstado();
        console.log('monitorou checkbox');
    }

    async handleRadioInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));
        
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

        if(idTarget === 0){
            return;
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        await this.salvarEstado();
        console.log('monitorou radio');
    }

    async handleSelectInteraction(domId, tempo, evento) {
        let idIniState = 0;
        let idFimState = 0;
        let idTargetEvent = 0;
        let idTarget = 0;
        const urlMapa = this.sanitizeText(this.normalizeUrl(window.location.href));
        
        // Obter valor do select diretamente do DOM
        const elemento = Array.from(document.body.querySelectorAll('*'))[domId];
        const valor = elemento && elemento.value ? elemento.value : '';

        const pages = this.xmlJquery.querySelectorAll('pages page');
        
        for (const page of pages) {
            if (this.normalizeUrl(page.getAttribute('url')) === urlMapa) {
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

        if(idTarget === 0){
            return;
        }
        
        this.xmlInteracoes += `\t\t<interaction id_int="${this.numInteracoes}" initialState="${idIniState}" finalState="${idFimState}" event_source="${idTargetEvent}" event_target="${idTargetEvent}" source_id="${idTarget}" type_source="component" target_id="${idTarget}" type_target="component">${this.tempoInteracao + tempo}</interaction>\n`;
        this.numInteracoes++;
        this.salvarEstado();
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

    async salvarEstado() {
        console.log("Salvando estados");

            try {
                const state = {
                    xmlFinalTracer: this.xmlFinalTracer || '',
                    xmlInteracoes: this.xmlInteracoes || '',
                    gravando: this.gravando,
                    xmlTracer: this.xmlTracer || '',
                    numInteracoes: this.numInteracoes,
                    tempoInteracao: this.tempoInteracao,
                    lastSaved: Date.now()
                };

                console.log("Estado a ser salvo:", {
                    xmlFinalTracerLength: state.xmlFinalTracer.length,
                    xmlInteracoesLength: state.xmlInteracoes.length,
                    gravando: state.gravando,
                    numInteracoes: state.numInteracoes
                });

                await chrome.storage.local.set({
                    xmlFinalTracer: state.xmlFinalTracer,
                    xmlInteracoes: state.xmlInteracoes,
                    gravando: state.gravando,
                    xmlTracer: state.xmlTracer,
                    numInteracoes: state.numInteracoes,
                    tempoInteracao: state.tempoInteracao,
                    isRecording: state.gravando,
                    tracerState: state // estado completo
                });

                try {
                    chrome.runtime.sendMessage({action: 'saveTracerState', tracerState: state});
                } catch (e){
                    console.warn('salvarEstado: falha ao enviar saveTracerState ao background', e);
                }

                console.log("Estado salvo com sucesso");
                return true;
            } catch (error) {
                console.error('Erro ao salvar estado:', error);
                return false;
            }
    }

    // Método para parar o monitoramento de eventos ao iniciar o processo de salvar
    removerEventos(){
        if (this.handleClickEventBound) {
            document.body.removeEventListener('click', this.handleClickEventBound);
        }
        if (this.handleKeypressEventBound) {
            document.body.removeEventListener('keypress', this.handleKeypressEventBound);
        }
        if (this.handleChangeEventBound) {
            document.body.removeEventListener('change', this.handleChangeEventBound);
        }
    }

    debugXML(){
        console.log("=== DEBUG XML STATE ===");
        console.log("xmlTracer length:", this.xmlTracer.length);
        console.log("xmlTracer first 100 chars:", this.xmlTracer.substring(0, 100));
        console.log("xmlTracer last 100 chars:", this.xmlTracer.substring(this.xmlTracer.length - 100));
        
        console.log("xmlFinalTracer length:", this.xmlFinalTracer.length);
        console.log("xmlFinalTracer first 100 chars:", this.xmlFinalTracer.substring(0, 100));
        console.log("xmlFinalTracer last 100 chars:", this.xmlFinalTracer.substring(this.xmlFinalTracer.length - 100));
        
        console.log("xmlInteracoes length:", this.xmlInteracoes.length);
        console.log("xmlInteracoes first 100 chars:", this.xmlInteracoes.substring(0, 100));
        console.log("xmlInteracoes last 100 chars:", this.xmlInteracoes.substring(this.xmlInteracoes.length - 100));
        
        // Verificar se há caracteres inválidos
        const invalidChars = this.xmlFinalTracer.match(/[^\x09\x0A\x0D\x20-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g);
        if (invalidChars) {
            console.warn("Caracteres inválidos encontrados:", invalidChars);
        }
    }

    corrigirXML(xmlString) {
        if(!xmlString) return '';
        // Remover caracteres inválidos
        let cleanXML = xmlString.replace(/[^\x09\x0A\x0D\x20-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g, '');
        
        cleanXML = cleanXML.replace(/[\uD83E\uDC06]/g, '');
        cleanXML = cleanXML.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
        cleanXML = cleanXML.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Símbolos e pictogramas
        cleanXML = cleanXML.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transporte e símbolos
        cleanXML = cleanXML.replace(/[\u{1F700}-\u{1F77F}]/gu, ''); // Alquimia
        cleanXML = cleanXML.replace(/[\u{1F780}-\u{1F7FF}]/gu, ''); // Formas geométricas
        cleanXML = cleanXML.replace(/[\u{1F800}-\u{1F8FF}]/gu, ''); // Seta suplementar
        cleanXML = cleanXML.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Suplementar
        cleanXML = cleanXML.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess
        cleanXML = cleanXML.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Símbolos
        
        // Remove caracteres de controle (exceto tab, LF, CR)
        cleanXML = cleanXML.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        // Garantir que todas as tags estão fechadas corretamente
        cleanXML = cleanXML.replace(/<interaction([^>]*)\/>/g, '<interaction$1></interaction>');
        cleanXML = cleanXML.replace(/<\/?tracer>/g, '');
        cleanXML = cleanXML.replace(/<interactions>/g, '\t<interactions>\n');
        cleanXML = cleanXML.replace(/<\/interactions>/g, '\t</interactions>\n');
        
        // Garantir que o XML termina com </site>
        if (!cleanXML.trim().endsWith('</site>')) {
            if (cleanXML.trim().endsWith('</tracer>')) {
                cleanXML = cleanXML.replace(/<\/tracer>\s*$/, '</site>');
            } else {
                cleanXML += '\n</site>';
            }
        }
        
        // Validar e corrigir estrutura básica
        if (!cleanXML.includes('</interactions>') && cleanXML.includes('<interactions>')) {
            const interactionsIndex = cleanXML.indexOf('<interactions>');
            const lastInteractionIndex = cleanXML.lastIndexOf('</interaction>');
            
            if (lastInteractionIndex > interactionsIndex) {
                cleanXML = cleanXML.substring(0, lastInteractionIndex + 15) + '\n\t</interactions>\n</site>';
            }
        }
        
        return cleanXML;
    }

    reconstruirXMLFinal() {
        const urlMapa = window.location.href;
        const titulo = document.title;

        this.xmlFinalTracer = '<?xml version="1.0" encoding="UTF-8"?>\n';
        this.xmlFinalTracer += `<site url="${this.escapeXml(urlMapa)}" titulo="${this.escapeXml(titulo)}" tipo="tracer">\n`;
        this.xmlFinalTracer += '\t<pages>\n';

        const pagesNode = this.xmlJquery.querySelector('pages');
        if(pagesNode){
            const pageElements = pagesNode.querySelectorAll('page');
            pageElements.forEach(page => {
                this.xmlFinalTracer += '\t\t' + page.outerHTML + '\n';
            });
        }

        this.xmlFinalTracer += '\t</pages>\n';

        // Adicionar interações se existirem
        if (this.xmlInteracoes && this.xmlInteracoes.trim() !== '') {
            if(this.xmlInteracoes.includes('<interactions>')){
                this.xmlFinalTracer += this.xmlInteracoes;
                this.xmlFinalTracer += '\t</interactions>\n';
            } else {
                this.xmlFinalTracer += '\t<interactions>\n';
                this.xmlFinalTracer += this.xmlInteracoes;
                this.xmlFinalTracer += '\t</interactions>\n';
            }
        } else {
            this.xmlFinalTracer += '\t<interactions>\n\t</interactions>\n';
        }
        
        // Fechar corretamente com </site>
        this.xmlFinalTracer += '</site>\n';
    }

    realizarDownload(xmlContent) {
       try {
            // Validação do conteúdo
            if (!xmlContent || xmlContent.trim() === '') {
                console.error('Conteúdo XML vazio ou inválido');
                alert('Erro: Conteúdo XML vazio. Não é possível realizar o download.');
                return;
            }

            console.log('Preparando download, tamanho do XML:', xmlContent.length);
            
            // Usar tipo MIME que força download
            const blob = new Blob([xmlContent], { 
                type: "application/xml;charset=utf-8"
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            // Nome do arquivo mais específico
            a.download = `mapa-tracer-${this.domain}-${Date.now()}.xml`;
            a.style.display = 'none';
            
            // Adicionar atributos que forçam download
            a.setAttribute('download', a.download);
            a.setAttribute('type', 'application/xml');
            
            document.body.appendChild(a);

            // Função para limpeza
            const cleanup = () => {
                setTimeout(() => {
                    if (document.body.contains(a)) {
                        document.body.removeChild(a);
                        console.log('Elemento <a> removido do DOM');
                    }
                    setTimeout(() => {
                        URL.revokeObjectURL(url);
                        console.log('URL do Blob revogada');
                        
                        // Limpar estado após download
                        this.limparEstado();
                        console.log('Estado limpo após download');
                    }, 1000);
                }, 3000);
            };

            // Estratégia 1: Click simples
            console.log('Tentativa 1: click() simples');
            a.click();
            
            // Verificar se o download foi iniciado
            setTimeout(() => {
                // Estratégia 2: MouseEvent com mais parâmetros
                console.log('Tentativa 2: MouseEvent detalhado');
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    detail: 1
                });
                
                a.dispatchEvent(event);
                
                // Estratégia 3: Se ainda não funcionar, tentar approach diferente
                setTimeout(() => {
                    // Cria um iframe para forçar download
                    console.log('Tentativa 3: usando iframe');
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                    
                    // Tenta fazer download via iframe
                    setTimeout(() => {
                        if (document.body.contains(a)) {
                            console.log('Download não iniciado, tentando abordagem alternativa...');
                            
                            // Última tentativa: cria link visível
                            a.style.display = 'block';
                            a.style.position = 'fixed';
                            a.style.top = '10px';
                            a.style.left = '10px';
                            a.style.zIndex = '10000';
                            a.style.background = '#f0f0f0';
                            a.style.padding = '10px';
                            a.style.border = '2px solid #007cba';
                            a.style.color = '#007cba';
                            a.textContent = 'CLIQUE AQUI PARA BAIXAR O XML';
                            
                            alert('O download automático não funcionou. Um link foi criado no topo da página. Clique nele com o BOTÃO DIREITO e selecione "Salvar link como..."');
                        } else {
                            cleanup();
                        }
                    }, 1000);
                    
                }, 500);
                
            }, 200);

        } catch (error) {
            console.error('Erro crítico no processo de download:', error);
            
            // Fallback: oferecer para copiar o conteúdo
            this.fallbackCopyXML(xmlContent);
        }
    }

    // Método auxiliar para fallback
    fallbackCopyXML(xmlContent) {
        try {
            // Tenta usar a API moderna de clipboard
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(xmlContent).then(() => {
                    const shouldDownload = confirm(
                        'Não foi possível iniciar o download automaticamente. ' +
                        'O conteúdo XML foi copiado para sua área de transferência.\n\n' +
                        'Deseja abrir uma nova janela com o XML para salvar manualmente?'
                    );
                    
                    if (shouldDownload) {
                        this.openXMLInNewWindow(xmlContent);
                    }
                }).catch(() => {
                    this.openXMLInNewWindow(xmlContent);
                });
            } else {
                this.openXMLInNewWindow(xmlContent);
            }
        } catch (copyError) {
            this.openXMLInNewWindow(xmlContent);
        }
    }

    // Método para abrir XML em nova janela para salvar manualmente
    openXMLInNewWindow(xmlContent) {
        const newWindow = window.open('', '_blank');
        if (newWindow) {
            newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>XML do Tracer - Salve este arquivo</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; }
                        pre { background: #f5f5f5; padding: 15px; border-radius: 5px; }
                        .instructions { 
                            background: #fff3cd; 
                            border: 1px solid #ffeaa7; 
                            padding: 15px; 
                            margin-bottom: 20px;
                            border-radius: 5px;
                        }
                    </style>
                </head>
                <body>
                    <div class="instructions">
                        <h3>📁 Como salvar o arquivo XML:</h3>
                        <ol>
                            <li>Pressione <strong>Ctrl+S</strong> (Windows) ou <strong>Cmd+S</strong> (Mac)</li>
                            <li>Salve o arquivo como <strong>mapa-tracer.xml</strong></li>
                            <li>Certifique-se de que o tipo é <strong>Arquivo XML (.xml)</strong></li>
                        </ol>
                    </div>
                    <pre>${this.escapeXml(xmlContent)}</pre>
                </body>
                </html>
            `);
            newWindow.document.close();
            
            // Foca na nova janela
            newWindow.focus();
        } else {
            alert('Popup bloqueado! Por favor, permita popups para este site e tente novamente.');
        }
    }

    async salvarXMLTracer() {
        console.log("salvarXMLTracer: parando monitoramento e gravação");
        this.removerEventos();
        this.encerrando = true;
        this.gravando = false;

        await this.salvarEstado();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Restaura o último estado persistido
        try {
            await this.initializeFromStorage();
        } catch (e){
            console.warn('salvarXMLTracer: falha ao restaurar do storage', e);
        }

        console.log("Estado após restauração:", {
            xmlFinalTracerLength: this.xmlFinalTracer?.length,
            xmlInteracoesLength: this.xmlInteracoes?.length
        });

        // Garante um xmlJquery válido
        if(!this.xmlJquery && this.xmlTracer){
            try {
                const parser = new DOMParser();
                this.xmlJquery = parser.parseFromString(this.xmlTracer, 'text/xml');
                const parseError = this.xmlJquery.querySelector('parsererror');
                if(parseError){
                    console.error('salvarXMLTracer: XML do mapa inválido:', parseError.textContent);
                    this.xmlJquery = null;
                }
            } catch(e){
                console.error('salvarXMLTracer: erro ao parsear xmlTracer', e);
                this.xmlJquery = null;
            }
        }
        
        this.debugXML();

        console.log("salvarXMLTracer: Iniciando salvamento do tracer");
        try{
            // Garantir que o XML está completo
            let finalXML = this.xmlFinalTracer || '';
            /*
            // Se finalXML estiver vazio, tenta reconstruir com base no xmlJquery
            if(!finalXML || finalXML.trim() === ''){
                console.warn('salvarXMLTracer: xmlFinalTracer vazio, tentando reconstruir...');
                if(this.xmlJquery){
                    try{
                        this.reconstruirXMLFinal();
                        finalXML = this.xmlFinalTracer || '';
                    } catch(e){
                        console.error('salvarXMLTracer: falha ao reconstruir xmlFinal', e);
                    }
                }
            } */
            finalXML = this.corrigirXML(finalXML);
            const invalidChars = finalXML.match(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g);
            if (invalidChars) {
                console.warn('Caracteres inválidos ainda presentes após correção:', invalidChars);
                // Remove qualquer caractere problemático residual
                finalXML = finalXML.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g, '');
            }
            /*
            // Garantir estrutura básica se ainda estiver incompleto
            if (!finalXML.includes('</site>')) {
                if (finalXML.includes('<interactions>') && !finalXML.includes('</interactions>')) {
                    const interactionsContent = finalXML.split('<interactions>')[1];
                    finalXML = finalXML.split('<interactions>')[0] + 
                            '\t<interactions>\n' + interactionsContent + 
                            '\t</interactions>\n</site>';
                } else {
                    finalXML += '\n</site>';
                }
            } */

            // remove a tag de fechamento </site> para adiciona as interacoes
            if(finalXML.trim().endsWith('</site>')){
                finalXML = finalXML.substring(0, finalXML.lastIndexOf('</site>')).trim();
            }
            // Adicionando interacoes
            finalXML += '\n' + this.xmlInteracoes;
            finalXML += '\n\t</interactions>';

            finalXML += '\n</site>';

            // Validar o XML final
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(finalXML, "text/xml");
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('XML inválido:', parseError.textContent);
                throw new Error('XML final está mal formado');
            }
            /*
            // adicionando interacoes
            // remove o fechamento da tag site
            finalXML = finalXML.replace('</site>', '');
            finalXML = finalXML.replace('</pages>', '</pages>\n' + this.xmlInteracoes);
            finalXML += '\n</interactions>';
            finalXML += '\n</site>'; */
            
            console.log("XML validado com sucesso, criando download...");
            this.realizarDownload(finalXML);
        } catch (error){
            console.log('Erro crítico ao gerar XML:', error);
            alert('Erro ao gerar arquivo XML. Verifique o console para detalhes');
            setTimeout( () => this.limparEstado(), 3000);
        }
    }

    limparEstado() {
        this.gravando = false;
        this.encerrando = false;
        this.xmlTracer = '';
        this.xmlFinalTracer = '';
        this.xmlInteracoes = '';
        this.numInteracoes = 1;
        this.tempoInteracao = 0;
        
        // Limpar também do storage
        chrome.storage.local.remove([
            'xmlFinalTracer', 'xmlInteracoes', 'gravando',
            'xmlTracer', 'numInteracoes', 'tempoInteracao'
        ]).catch(error => {
            console.error('Erro ao limpar storage:', error);
        });
    }
}

// Torna o escopo da classe global
window.WebTracer = WebTracer;