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

            // Esperar até que o Supabase esteja disponível (máximo 5 segundos)
            let attempts = 0;
            while (!window.supabase && attempts < 10) {
                await new Promise(r => setTimeout(r, 500));
                attempts++;
            }

            if (this.useCloud && window.supabase) {
                try {
                    this.db = supabase.createClient(SB_URL, SB_KEY);
                    console.log("Supabase Conectado ✅");
                } catch (err) {
                    console.error("ERRO CRÍTICO NO SUPABASE:", err);
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

    loginAdmin(email, password) {
        if (email === 'admin.rifas@dm.com' && password === 'dollynstorm.admins') {
            localStorage.setItem(this.KEYS.ADMIN_AUTH, 'true');
            return true;
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
            const { data, error } = await this.db.from('purchases').select('*');
            if (!error && data) return data;
            if (error) console.warn("Erro ao buscar compras do Supabase:", error);
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

        // 1. Sincronizar Nuvem (Real Saving)
        if (this.useCloud && this.db) {
            try {
                const { error } = await this.db.from('raffles').upsert({
                    id: raffle.id,
                    name: raffle.name,
                    description: raffle.description,
                    imageUrl: raffle.imageUrl, // Mapped to quoted "imageUrl"
                    price: parseFloat(raffle.price),
                    minQty: parseInt(raffle.minQty), // Mapped to quoted "minQty"
                    status: raffle.status,
                    createdAt: raffle.createdAt // Mapped to quoted "createdAt"
                });
                if (error) throw error;
                console.log("Rifa salva no Supabase com sucesso.");
            } catch (err) {
                console.error("Erro ao salvar no Supabase:", err);
                throw new Error("Falha ao salvar no banco (Nuvem): " + (err.message || JSON.stringify(err)));
            }
        }

        // 2. Atualizar Local
        let raffles = JSON.parse(localStorage.getItem(this.KEYS.RAFFLES_LIST) || '[]');
        raffles = raffles.filter(r => r.id !== raffle.id);
        raffles.push(raffle);
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));

        window.dispatchEvent(new Event('storage'));
        return true;
    },

    async deleteRaffle(id) {
        await this.init();
        if (this.useCloud && this.db) {
            try {
                const { error } = await this.db.from('raffles').delete().eq('id', id);
                if (error) throw error;
                console.log("Rifa excluída do Supabase.");
            } catch (err) {
                console.error("Erro ao excluir do Supabase:", err);
                throw new Error("Falha ao excluir no banco (Nuvem): " + err.message);
            }
        }

        // Sempre atualizar local para consistência
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
            date: new Date().toLocaleString('pt-BR'),
            status: 'PIX GERADO'
        };

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
                    numbers: newPurchase.numbers,
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

        let targetPurchase = null;
        let purchases = [];

        if (this.useCloud && this.db) {
            const { data, error } = await this.db.from('purchases').select('*').eq('id', purchaseId).single();
            if (!error) targetPurchase = data;
        } else {
            purchases = await this.getPurchases();
            targetPurchase = purchases.find(p => p.id === purchaseId);
        }

        if (!targetPurchase) throw new Error("Venda não encontrada.");

        // Gerar números apenas na aprovação
        const numbers = await this.generateUniqueNumbers(targetPurchase.raffleId, targetPurchase.qty);

        if (this.useCloud && this.db) {
            await this.db.from('purchases').update({
                status: 'PAGAMENTO APROVADO',
                numbers: numbers
            }).eq('id', purchaseId);
        } else {
            const idx = purchases.findIndex(p => p.id === purchaseId);
            if (idx !== -1) {
                purchases[idx].status = 'PAGAMENTO APROVADO';
                purchases[idx].numbers = numbers;
                localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(purchases));
            }
        }
        window.dispatchEvent(new Event('storage'));
        return true;
    },

    async getStats() {
        const purchases = await this.getPurchases();
        // Apenas contas confirmadas ou com PIX gerado (que o admin vê como venda potencial)
        const validPurchases = purchases.filter(p => ['PIX GERADO', 'PAGAMENTO APROVADO'].includes(p.status));
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
    renderMenu() {
        const desktopNav = document.querySelector('.desktop-nav ul');
        const sidebarNav = document.querySelector('.sidebar-nav ul');
        const adminNav = document.querySelector('.admin-nav ul');
        const navActions = document.getElementById('navActions');
        const isAdmin = this.isAdmin();
        const user = this.getCurrentUser();

        if (!document.querySelector('.mobile-bottom-nav') && !isAdmin) {
            const bottomNav = document.createElement('div');
            bottomNav.className = 'mobile-bottom-nav';
            document.body.appendChild(bottomNav);
        }

        const navItems = [
            { label: 'Início', href: 'index.html', icon: 'home' },
            { label: 'Campanhas', href: 'index.html#campanhas', icon: 'crosshair' },
            { label: 'Ganhadores', href: 'ganhadores.html', icon: 'trophy' },
            { label: 'Minhas Cotas', href: 'dashboard.html', icon: 'user' }
        ];

        if (desktopNav) {
            desktopNav.innerHTML = navItems.map(m => `
                <li><a href="${m.href}">${m.label}</a></li>
            `).join('');
        }

        if (sidebarNav) {
            sidebarNav.innerHTML = navItems.map(m => `
                <li><a href="${m.href}"><i data-lucide="${m.icon}"></i> ${m.label}</a></li>
            `).join('');
            if (user || isAdmin) {
                sidebarNav.innerHTML += `<li><a href="#" onclick="DataService.logout()"><i data-lucide="log-out"></i> Sair</a></li>`;
            } else {
                sidebarNav.innerHTML += `<li><a href="login.html"><i data-lucide="log-in"></i> Entrar</a></li>`;
            }
        }

        const bottomNavContainer = document.querySelector('.mobile-bottom-nav');
        if (bottomNavContainer && !isAdmin) {
            bottomNavContainer.innerHTML = navItems.map(m => `
                <a href="${m.href}" class="mobile-nav-item">
                    <i data-lucide="${m.icon}"></i>
                    <span>${m.label}</span>
                </a>
            `).join('');
        }

        if (adminNav) {
            adminNav.innerHTML = `
                <li><a href="admin.html#dashboard"><i data-lucide="layout-dashboard"></i> Dashboard</a></li>
                <li><a href="admin.html#pendentes"><i data-lucide="clock"></i> Pagamentos</a></li>
                <li><a href="admin.html#rifas"><i data-lucide="package"></i> Rifas</a></li>
                <li><a href="admin.html#sorteio"><i data-lucide="award"></i> Sorteio</a></li>
                <li><a href="admin.html#vencedores"><i data-lucide="user-plus"></i> Ganhador</a></li>
                <li><a href="admin.html#compras"><i data-lucide="shopping-cart"></i> Vendas</a></li>
                <li><a href="#" onclick="DataService.logout()"><i data-lucide="log-out"></i> Sair</a></li>
            `;
        }

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
        }

        if (window.lucide) lucide.createIcons();
    }
};

// Auto-boot Service
(async () => {
    await DataService.init();
})();
