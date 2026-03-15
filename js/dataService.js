/**
 * Dollyn Storm - Data & Realtime Cloud Service (Supabase)
 * Centralized database for global synchronization across devices.
 */

const DataService = {
    KEYS: {
        USERS: 'users',
        PURCHASES: 'purchases',
        RAFFLES: 'winners',
        RAFFLES_LIST: 'raffles',
        CURRENT_USER: 'ds_current_user',
        ADMIN_AUTH: 'ds_admin_auth'
    },

    db: null,
    initPromise: null,
    initializing: false,
    useCloud: true,
    async init() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            if (this.initializing) return;
            this.initializing = true;

            // 1. CARREGAMENTO INSTANTÂNEO (Local-First)
            this.loadLocalCache();

            const SB_URL = "https://wggseeibnxcsefbxjuxj.supabase.co";
            const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndnZ3NlZWlibnhjc2VmYnhqdXhqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjM2OTEsImV4cCI6MjA4ODM5OTY5MX0.zYQ9ezZQuiqGl_lskROwkOsxqMdULuqDADXJeLl5nDk";

            // 3. Aguarda Supabase (se necessário) sem loop infinito ou travamentos
            if (this.useCloud && !window.supabase) {
                await new Promise(resolve => {
                    const timer = setTimeout(resolve, 3000); // Timeout de 3s
                    window.addEventListener('load', () => {
                        clearTimeout(timer);
                        resolve();
                    }, { once: true });
                });
            }

            if (this.useCloud && window.supabase) {
                try {
                    this.db = supabase.createClient(SB_URL, SB_KEY);
                    // Testar conexão imediatamente
                    const { error } = await this.db.from('raffles').select('id').limit(1);
                    if (error) {
                        console.error("Erro de conexão com tabelas:", error.message);
                        this.db = null; // Reset if tables are missing
                    } else {
                        console.log("Supabase Conectado e Tabelas Verificadas ✅");
                    }
                } catch (err) {
                    console.error("ERRO CRÍTICO NO SUPABASE:", err);
                    this.db = null;
                }
            } else if (this.useCloud) {
                console.error("Supabase SDK não carregado!");
            }

            this.initializing = false;
            this.renderMenu();
            window.dispatchEvent(new Event('ds_init'));
        })();

        return this.initPromise;
    },

    loadLocalCache() {
        // Apenas para inicializar as chaves se estiverem nulas
        if (localStorage.getItem(this.KEYS.RAFFLES_LIST) === null) {
            localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify([]));
        }
        if (localStorage.getItem(this.KEYS.RAFFLES) === null) {
            localStorage.setItem(this.KEYS.RAFFLES, JSON.stringify([]));
        }
    },

    syncCloudToLocal(data) {
        if (data.raffles) localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(Object.values(data.raffles)));
        if (data.winners) localStorage.setItem(this.KEYS.RAFFLES, JSON.stringify(Object.values(data.winners)));
        if (data.purchases) localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(Object.values(data.purchases)));
    },


    // --- Auth Logic ---
    getCurrentUser() {
        return JSON.parse(localStorage.getItem(this.KEYS.CURRENT_USER));
    },

    isAdmin() {
        return localStorage.getItem(this.KEYS.ADMIN_AUTH) === 'true';
    },

    async loginAdmin(email, password) {
        // 1. Verificação de Fallback (para quando a nuvem está offline mas o admin já logou antes neste dispositivo)
        if (email === 'admin.rifas@dm.com' && password === 'dollynstorm.admins') {
            localStorage.setItem(this.KEYS.ADMIN_AUTH, 'true');

            // 2. Tentar sincronizar com a nuvem para garantir que outros dispositivos saibam
            if (this.db) {
                try {
                    await this.db.from('users').upsert({
                        email: email,
                        password: this.encryptPassword(password),
                        role: 'admin',
                        name: 'Administrador'
                    }, { onConflict: 'email' });
                } catch (e) { console.warn("Erro ao sincronizar admin com nuvem:", e); }
            }
            return true;
        }

        // 3. Verificação Universal via Supabase (Permite login em qualquer dispositivo)
        if (this.db) {
            try {
                const { data, error } = await this.db.from('users')
                    .select('*')
                    .eq('email', email)
                    .eq('role', 'admin')
                    .single();

                if (data && data.password === this.encryptPassword(password)) {
                    localStorage.setItem(this.KEYS.ADMIN_AUTH, 'true');
                    return true;
                }
            } catch (err) {
                console.error("Erro na autenticação cloud do admin:", err);
            }
        }
        return false;
    },

    logout() {
        localStorage.removeItem(this.KEYS.CURRENT_USER);
        localStorage.removeItem(this.KEYS.ADMIN_AUTH);
        window.location.href = 'index.html';
    },

    // --- Utilities ---
    validateCPF(cpf) {
        if (!cpf) return false;
        cpf = cpf.replace(/[^\d]+/g, '');
        if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
        let s = 0;
        for (let i = 0; i < 9; i++) s += parseInt(cpf.charAt(i)) * (10 - i);
        let r = 11 - (s % 11);
        if (r === 10 || r === 11) r = 0;
        if (r !== parseInt(cpf.charAt(9))) return false;
        s = 0;
        for (let i = 0; i < 10; i++) s += parseInt(cpf.charAt(i)) * (11 - i);
        r = 11 - (s % 11);
        if (r === 10 || r === 11) r = 0;
        return r === parseInt(cpf.charAt(10));
    },

    encryptPassword(pass) {
        return btoa(pass).split('').reverse().join('');
    },

    // --- Data Management (Cloud Sync) ---
    getUsers() {
        return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]');
    },

    async getPurchases() {
        await this.init();
        if (this.useCloud && this.db) {
            try {
                const { data, error } = await this.db.from('purchases').select('*').order('id', { ascending: false });
                if (!error && data) {
                    localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(data));
                    return data;
                }
                if (error) console.warn("Supabase Purchases Error:", error.message);
            } catch (err) {
                console.error("Critical GetPurchases Error:", err);
            }
        }
        return JSON.parse(localStorage.getItem(this.KEYS.PURCHASES) || '[]');
    },

    async getNumbersSold() {
        const purchases = await this.getPurchases();
        const allNumbers = [];
        purchases.forEach(p => {
            if (p.numbers) {
                p.numbers.forEach(num => {
                    allNumbers.push({
                        number: num,
                        userName: p.userName,
                        userCpf: p.userCpf,
                        userPhone: p.userPhone,
                        raffleId: p.raffleId,
                        raffleName: p.raffleName,
                        qty: p.qty
                    });
                });
            }
        });
        return allNumbers;
    },

    async getLotteryData() {
        const local = localStorage.getItem(this.KEYS.RAFFLES);
        return local ? JSON.parse(local) : [];
    },

    async getRafflesList() {
        await this.init();
        if (this.useCloud && this.db) {
            try {
                const { data, error } = await this.db.from('raffles').select('*');
                if (!error && data) {
                    localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(data));
                    return data;
                }
            } catch (err) {
                console.warn("Erro ao buscar rifas do Supabase:", err);
            }
        }

        const local = localStorage.getItem(this.KEYS.RAFFLES_LIST);
        const data = local ? JSON.parse(local) : [];

        if (data.length === 0 && localStorage.getItem('ds_initial_boot') === null) {
            const initial = [{
                id: 'test-raffle',
                name: 'Produto Teste',
                description: 'Este produto é apenas para teste inicial do sistema.',
                imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop',
                price: 0.50,
                minQty: 5,
                status: 'Ativa',
                createdAt: new Date().toISOString()
            }];
            localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(initial));
            localStorage.setItem('ds_initial_boot', 'done');
            return initial;
        }
        return data;
    },

    async saveRaffle(raffle) {
        await this.init();
        if (!raffle.imageUrl) throw new Error("Imagem é obrigatória.");

        // Garantir campos obrigatórios
        if (!raffle.createdAt) raffle.createdAt = new Date().toISOString();

        // 1. Sincronizar Nuvem (Obrigatório para Admin)
        if (this.useCloud) {
            if (!this.db) {
                throw new Error("Sincronização com a nuvem falhou. A rifa NÃO foi salva para os outros dispositivos. Verifique se as tabelas foram criadas no Supabase.");
            }
            try {
                const { error } = await this.db.from('raffles').upsert({
                    id: raffle.id,
                    name: raffle.name,
                    description: raffle.description,
                    imageUrl: raffle.imageUrl,
                    price: parseFloat(raffle.price),
                    minQty: parseInt(raffle.minQty),
                    totalNumbers: parseInt(raffle.totalNumbers || 0),
                    isFree: !!raffle.isFree,
                    status: raffle.status,
                    createdAt: raffle.createdAt
                });
                if (error) throw error;
                console.log("Rifa salva no Supabase com sucesso.");
            } catch (err) {
                console.error("Erro ao salvar no Supabase:", err);
                throw new Error("Falha ao salvar na Nuvem: " + (err.message || "Tabela 'raffles' não encontrada."));
            }
        }

        // 2. Atualizar Local (apenas após sucesso da nuvem ou se nuvem desativada propositalmente)
        let raffles = JSON.parse(localStorage.getItem(this.KEYS.RAFFLES_LIST) || '[]');
        raffles = raffles.filter(r => r.id !== raffle.id);
        raffles.push(raffle);
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));

        window.dispatchEvent(new Event('storage'));
        return true;
    },

    async deleteRaffle(id) {
        await this.init();
        if (this.useCloud) {
            if (!this.db) throw new Error("Não é possível excluir sem conexão com a nuvem.");
            try {
                const { error } = await this.db.from('raffles').delete().eq('id', id);
                if (error) throw error;
                console.log("Rifa excluída do Supabase.");
            } catch (err) {
                console.error("Erro ao excluir do Supabase:", err);
                throw new Error("Falha ao excluir na Nuvem: " + err.message);
            }
        }

        let raffles = JSON.parse(localStorage.getItem(this.KEYS.RAFFLES_LIST) || '[]');
        raffles = raffles.filter(r => r.id !== id);
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));
        window.dispatchEvent(new Event('storage'));
    },

    async saveWinner(winner) {
        const entry = {
            ...winner,
            date: winner.date || new Date().toLocaleString('pt-BR'),
            id: winner.id || 'w-' + Date.now()
        };

        // 1. Salvar Local
        const winners = JSON.parse(localStorage.getItem(this.KEYS.RAFFLES) || '[]');
        winners.push(entry);
        localStorage.setItem(this.KEYS.RAFFLES, JSON.stringify(winners));

        // 2. Sincronizar Nuvem
        if (this.useCloud && this.db) {
            await this.db.from('winners').upsert(entry);
        }

        window.dispatchEvent(new Event('storage'));
    },

    // --- Critical Payment & Number Flow ---
    async generateUniqueNumbers(raffleId, qty) {
        const purchases = await this.getPurchases();
        const soldNumbers = new Set();
        purchases.filter(p => p.raffleId === raffleId).forEach(p => {
            if (p.numbers) p.numbers.forEach(n => soldNumbers.add(n));
        });

        const newNumbers = [];
        while (newNumbers.length < qty) {
            const num = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
            if (!soldNumbers.has(num) && !newNumbers.includes(num)) {
                newNumbers.push(num);
            }
        }
        return newNumbers;
    },

    async completePurchase(data) {
        if (!data.raffleId || !data.qty || !data.userName || !data.userPhone) {
            throw new Error("Dados insuficientes.");
        }

        const purchaseId = Date.now() + Math.random().toString(36).substr(2, 9);
        const newPurchase = {
            id: purchaseId,
            raffleId: data.raffleId,
            raffleName: data.raffleName || 'Rifa de Skin',
            userName: data.userName,
            userCpf: data.userCpf || 'Não informado',
            userPhone: data.userPhone,
            amount: data.amount,
            qty: data.qty,
            numbers: [], // Vazio até aprovação
            attempts: 0, // Campo para limite de aprovações
            date: new Date().toLocaleString('pt-BR'),
            status: 'PIX GERADO'
        };

        // 1. Verificar se a rifa é gratuita
        const raffles = await this.getRafflesList();
        const raffle = raffles.find(r => r.id === data.raffleId);

        if (raffle && raffle.isFree) {
            newPurchase.status = 'Aprovado';
            newPurchase.amount = 0; // Garantir valor zero para gratuidade
            // Gerar números imediatamente
            newPurchase.numbers = await this.generateUniqueNumbers(data.raffleId, data.qty);

            // Verificação de Limite (Auto-Encerrar)
            if (raffle.totalNumbers > 0) {
                const sold = await this.getNumbersSold();
                const totalSoldForThis = sold.filter(n => n.raffleId === data.raffleId).length + parseInt(data.qty);

                if (totalSoldForThis >= raffle.totalNumbers) {
                    console.log("Limite atingido! Encerrando rifa gratuita...");
                    raffle.status = 'Encerrada';
                    await this.saveRaffle(raffle);
                }
            }
        }

        if (this.useCloud && this.db) {
            try {
                const { error } = await this.db.from('purchases').insert({
                    id: newPurchase.id,
                    raffleId: newPurchase.raffleId, // Mapped to quoted "raffleId"
                    raffleName: newPurchase.raffleName, // Mapped to quoted "raffleName"
                    userName: newPurchase.userName, // Mapped to quoted "userName"
                    userCpf: newPurchase.userCpf, // Mapped to quoted "userCpf"
                    userPhone: newPurchase.userPhone, // Mapped to quoted "userPhone"
                    amount: parseFloat(newPurchase.amount),
                    qty: parseInt(newPurchase.qty),
                    numbers: newPurchase.numbers || [],
                    attempts: newPurchase.attempts,
                    date: newPurchase.date,
                    status: newPurchase.status
                });
                if (error) throw error;
                console.log("Compra salva no Supabase.");
            } catch (err) {
                console.error("Erro ao salvar compra no Supabase:", err);
                // Fallback local se a nuvem falhar para não perder a venda
                const purchases = await this.getPurchases();
                purchases.push(newPurchase);
                localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(purchases));
            }
        } else {
            const purchases = await this.getPurchases();
            purchases.push(newPurchase);
            localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(purchases));
        }
        window.dispatchEvent(new Event('storage'));
        return newPurchase;
    },

    async confirmPurchase(purchaseId) {
        await this.init();
        console.log("Confirmando compra:", purchaseId);

        let targetPurchase = null;
        let purchases = await this.getPurchases();

        if (this.useCloud && this.db) {
            const { data, error } = await this.db.from('purchases').select('*').eq('id', purchaseId).single();
            if (error) {
                console.error("Erro ao buscar venda para confirmar:", error);
                throw new Error("Não foi possível encontrar a venda no banco de dados.");
            }
            targetPurchase = data;
        } else {
            targetPurchase = purchases.find(p => p.id === purchaseId);
        }

        if (!targetPurchase) throw new Error("Venda não encontrada.");

        // TRAVA DE SEGURANÇA: Limite de 2 aprovações
        const attempts = (targetPurchase.attempts || 0);
        if (attempts >= 2) {
            throw new Error("Limite de tentativas atingido. Volte amanhã ou clique em meus números para ver se chegou ou olhar o whatsapp.");
        }

        // Gerar números apenas na aprovação
        const numbers = await this.generateUniqueNumbers(targetPurchase.raffleId, targetPurchase.qty);
        console.log("Números gerados:", numbers);

        const newAttempts = attempts + 1;

        if (this.useCloud && this.db) {
            const { error } = await this.db.from('purchases').update({
                status: 'Aprovado',
                numbers: numbers,
                attempts: newAttempts
            }).eq('id', purchaseId);

            if (error) {
                console.error("Erro ao atualizar status no Supabase:", error);
                throw new Error("Falha ao entregar números na nuvem: " + error.message);
            }
            console.log("Status atualizado na nuvem com sucesso.");
        }

        // SEMPRE atualizar local para refletir imediatamente na UI do admin
        const idx = purchases.findIndex(p => p.id === purchaseId);
        if (idx !== -1) {
            purchases[idx].status = 'Aprovado';
            purchases[idx].numbers = numbers;
            purchases[idx].attempts = newAttempts;
            localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(purchases));
        }

        window.dispatchEvent(new Event('storage'));
        return true;
    },

    async getStats() {
        const purchases = await this.getPurchases();
        // Apenas contas confirmadas ou com PIX gerado (que o admin vê como venda potencial)
        const validPurchases = purchases.filter(p => ['PIX GERADO', 'Aprovado', 'Confirmado'].includes(p.status));
        const totalNumbers = validPurchases.reduce((sum, p) => sum + (p.numbers ? p.numbers.length : 0), 0);
        const totalRevenue = validPurchases.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        return {
            totalRevenue: totalRevenue.toFixed(2),
            totalPurchases: validPurchases.length,
            totalUsers: 'Vários',
            totalNumbers: totalNumbers
        };
    },

    // --- UI Rendering ---
    lastRenderedState: null,
    renderMenu() {
        // Debounce/Throttle check: evita renderizar mais de uma vez por frame
        if (this._rendering) return;
        this._rendering = true;

        requestAnimationFrame(() => {
            const isAdmin = this.isAdmin();
            const user = this.getCurrentUser();
            const stateKey = `${isAdmin}-${user?.email || 'none'}`;

            // Evita re-renderizar se nada mudou
            if (this.lastRenderedState === stateKey) {
                this._rendering = false;
                return;
            }

            const desktopNav = document.querySelector('.desktop-nav ul');
            const sidebarNav = document.querySelector('.sidebar-nav ul');
            const navActions = document.getElementById('navActions');
            const bottomNavContainer = document.querySelector('.mobile-bottom-nav');

            if (!bottomNavContainer && !isAdmin && !document.querySelector('.mobile-bottom-nav')) {
                const bottomNav = document.createElement('div');
                bottomNav.className = 'mobile-bottom-nav';
                document.body.appendChild(bottomNav);
            }

            const navItems = [
                { label: 'Início', href: 'index.html', icon: 'home' },
                { label: 'Campanhas', href: 'index.html#campanhas', icon: 'crosshair' },
                { label: 'Ganhadores', href: 'ganhadores.html', icon: 'trophy' },
                { label: 'Minhas Cotas', href: 'dashboard.html', icon: 'user' },
                { label: 'Sobre Nós', href: 'sobre-nos.html', icon: 'info' },
                { label: 'Termos de Uso', href: 'termos-de-uso.html', icon: 'file-text' }
            ];

            const navItemsHtml = navItems.map(m => `<li><a href="${m.href}">${m.label}</a></li>`).join('');
            const sidebarItemsHtml = navItems.map(m => `<li><a href="${m.href}"><i data-lucide="${m.icon}"></i> ${m.label}</a></li>`).join('') +
                (user || isAdmin ? `<li><a href="#" onclick="DataService.logout()"><i data-lucide="log-out"></i> Sair</a></li>` : `<li><a href="login.html"><i data-lucide="log-in"></i> Entrar</a></li>`);

            const bottomNavHtml = navItems.map(m => `
                <a href="${m.href}" class="mobile-nav-item">
                    <i data-lucide="${m.icon}"></i>
                    <span>${m.label}</span>
                </a>
            `).join('');

            if (desktopNav) desktopNav.innerHTML = navItemsHtml;
            if (sidebarNav) sidebarNav.innerHTML = sidebarItemsHtml;
            if (bottomNavContainer && !isAdmin) bottomNavContainer.innerHTML = bottomNavHtml;

            if (navActions) {
                let actionsHtml = '';
                if (isAdmin || user) {
                    actionsHtml += `<span class="user-greeting">Olá, ${(user?.name || 'Admin').split(' ')[0]}</span>`;
                    actionsHtml += `<a href="#" onclick="DataService.logout()" class="nav-btn-link">Sair</a>`;
                } else {
                    actionsHtml += `<a href="login.html" class="premium-btn sm">Entrar</a>`;
                }
                actionsHtml += `<button class="menu-toggle" id="menuToggle"><span></span><span></span><span></span></button>`;
                navActions.innerHTML = actionsHtml;

                // Re-atribui o evento de toggle se necessário (caso o botão tenha sido recriado)
                const menuToggle = document.getElementById('menuToggle');
                if (menuToggle && window.MainApp && window.MainApp.setupToggles) {
                    window.MainApp.setupToggles();
                }
            }

            if (window.lucide) lucide.createIcons();
            this.lastRenderedState = stateKey;
            this._rendering = false;
        });
    }
};

// Auto-boot Service
(async () => {
    await DataService.init();
})();
