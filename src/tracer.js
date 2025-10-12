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
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    async iniciaTracer() {
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
            this.xmlFinalTracer += `<site url="${this.escapeXml(urlMapa)}" titulo="${this.escapeXml(titulo)}" tipo="tracer">\n`;
            this.xmlFinalTracer += '\t<pages>\n';

            // Utilização do objeto XML
            const pagesNode = this.xmlJquery.querySelector('pages');
            if(pagesNode){
                // Obtendo o conteúdo das tags <page>
                const pageElements = pagesNode.querySelectorAll('page');
                pageElements.forEach(page => {
                    console.log(page.outerHTML);
                    this.xmlFinalTracer += '\t\t' + page.outerHTML + '\n';
                });
            } else {
                console.error('Não foi possível encontrar a seção <pages> no XML');
                this.xmlFinalTracer += '\t\t<!-- Pages não encontradas -->\n';
            }

            this.xmlFinalTracer += '\t</pages>\n';

            this.xmlInteracoes = '\t<interactions>\n';
            
            this.gravando = true;

            await this.salvarEstado();

            this.monitorarEventos();

            console.log("Tracer iniciado com sucesso!");
            console.log("xmlFinalTracer inicializado:", this.xmlFinalTracer.length, "caracteres");
            console.log("xmlInteracoes inicializado:", this.xmlInteracoes.length, "caracteres");

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
<<<<<<< HEAD
            e.preventDefault();
            e.stopPropagation();
=======
            this.encerrando = true;
            this.removerEventos();
>>>>>>> 9a50353 (Correcao do armazenamento e recuperacao do estado do tracer)

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
<<<<<<< HEAD

                // 2. Salva o estado UMA ÚLTIMA VEZ para garantir que a última interação seja registrada
                this.salvarEstado(async () => {
                    try {
                        // 3. AVISA O BACKGROUND SCRIPT PARA PARAR E SALVAR.
                        // Esta é a mudança principal.
                        console.log("Tracer: Solicitando ao background para parar e salvar.");
                        await chrome.runtime.sendMessage({ action: "stopTracerAndSave" });
                        
                        // Desabilitar mais cliques na página para evitar interações extras
                        document.body.style.pointerEvents = 'none'; 
                        alert('Gravação encerrada. O download do arquivo XML será iniciado.');

                    } catch (error) {
                        console.error("Tracer: Falha ao enviar mensagem 'stopTracerAndSave' para o background.", error);
                    }
=======
                this.salvarEstado(() => {
                    this.salvarXMLTracer();
                    setTimeout(() => {
                        window.location.href = url;
                    }, 1000);
>>>>>>> 9a50353 (Correcao do armazenamento e recuperacao do estado do tracer)
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
    async handleButtonInteraction(domId, tempo, evento){
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
        await this.salvarEstado();
        console.log('monitorou input');
    }

    async handleCheckInteraction(domId, tempo, evento) {
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
        await this.salvarEstado();
        console.log('monitorou checkbox');
    }

    async handleRadioInteraction(domId, tempo, evento) {
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
        await this.salvarEstado();
        console.log('monitorou radio');
    }

    async handleSelectInteraction(domId, tempo, evento) {
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
        // Remover caracteres inválidos
        let cleanXML = xmlString.replace(/[^\x09\x0A\x0D\x20-\xFF\u0100-\uD7FF\uE000-\uFFFD]/g, '');
        
        // Garantir que todas as tags estão fechadas corretamente
        cleanXML = cleanXML.replace(/<interaction([^>]*)\/>/g, '<interaction$1></interaction>');
        
        // Escapar caracteres especiais
        cleanXML = cleanXML.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&apos;');
        
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
    }

    realizarDownload(xmlContent) {
        try{
            const blob = new Blob([xmlContent], { type: "text/xml;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = "mapa-tracer-" + Date.now() + ".xml";
            a.style.display = 'none';
            document.body.appendChild(a);

            const attemptDownload = () => {
            try {
                a.click();
                console.log('Download iniciado');
                setTimeout(() => {
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                    // Limpa depois, mas dá espaço para inspeção
                    this.limparEstado();
                }, 5000);
                }, 1000);
            } catch (error) {
                console.error('Erro no download, tentando novamente...', error);
                setTimeout(attemptDownload, 500);
            }
            };

            setTimeout(attemptDownload, 100);
        } catch (error) {
            console.error('Erro no processo de download:', error);
            // Adiar limpeza para permitir depuração
            setTimeout(() => this.limparEstado(), 3000);
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
                this.xmlJquery = parseFromString(this.xmlTracer, 'text/xml');
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
            }

            // Garante fechamento de tags e inclusão das interações
            if(!finalXML.includes('<interactions')){
                finalXML += '\t<interactions>\n';
                finalXML += (this.xmlInteracoes || '');
                finalXML += '\t</interactions>\n';
                finalXML += '</tracer>\n';
            }

            // Validar o XML final
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(finalXML, "text/xml");
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('XML inválido:', parseError.textContent);
                throw new Error('XML final está mal formado');
            }
            
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