/**
 * Dollyn Storm - Data & Realtime Cloud Service (Supabase)
 * Centralized database for global synchronization across devices.
 */

const DataService = {
    KEYS: {
        RAFFLES_LIST: 'raffles',
        PURCHASES: 'purchases',
        ADMIN_AUTH: 'ds_admin_auth',
        CURRENT_USER: 'ds_current_user',
        USERS: 'users',
        RAFFLES: 'winners'
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
    async getUsers() {
        await this.init();
        let localUsers = [];
        try {
            localUsers = JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]');
        } catch (e) {
            console.warn("Error parsing local users", e);
        }

        if (this.useCloud && this.db) {
            try {
                // Fetch unique users from 'purchases' table to populate the admin list
                const { data, error } = await this.db.from('purchases').select('userName, userPhone, userCpf, date');
                if (!error && data) {
                    const mergedUsers = [...localUsers];
                    data.forEach(p => {
                        // Check if this user (by phone) is already in the list to avoid duplicates
                        const exists = mergedUsers.find(u => 
                            (u.phone || '').replace(/\D/g, '') === (p.userPhone || '').replace(/\D/g, '')
                        );
                        if (!exists) {
                            mergedUsers.push({
                                name: p.userName,
                                phone: p.userPhone,
                                cpf: p.userCpf,
                                date: p.date ? p.date.split(' ')[0] : '-',
                                isFromCloud: true
                            });
                        }
                    });
                    return mergedUsers;
                }
            } catch (err) {
                console.error("Erro ao buscar usuários do Supabase:", err);
            }
        }
        return localUsers;
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
        let raffles = [];
        if (this.useCloud && this.db) {
            try {
                const { data, error } = await this.db.from('raffles').select('*');
                if (!error && data) {
                    raffles = data;
                }
            } catch (err) {
                console.warn("Erro ao buscar rifas do Supabase:", err);
            }
        }

        if (raffles.length === 0) {
            const local = localStorage.getItem(this.KEYS.RAFFLES_LIST);
            raffles = local ? JSON.parse(local) : [];
        }

        // Automatic Activation Logic
        const now = new Date();
        raffles = raffles.map(r => {
            if (r.status === 'Inativa' && r.activationDate) {
                const adate = new Date(r.activationDate);
                if (adate <= now) {
                    r.status = 'Ativa';
                    // We don't necessarily need to save back here immediately, 
                    // the view will reflect it and future saves will persist it.
                }
            }
            return r;
        });

        // Sync local cache
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));

        // Filter for non-admins
        if (!this.isAdmin()) {
            return raffles.filter(r => r.status === 'Ativa' || r.status === 'Disponível');
        }

        return raffles;
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
                    maxPerUser: raffle.maxPerUser ? parseInt(raffle.maxPerUser) : null,
                    isFree: !!raffle.isFree,
                    status: raffle.status,
                    activationDate: raffle.activationDate || null,
                    createdAt: raffle.createdAt
                });
                if (error) {
                    if (error.message && (error.message.includes("activationDate") || error.message.includes("isFree") || error.message.includes("maxPerUser"))) {
                        throw new Error("ERRO DE COLUNA NO SUPABASE: A coluna 'activationDate', 'isFree' ou 'maxPerUser' não foi encontrada. Você PRECISA rodar o script SQL no Supabase Editor:\n\nALTER TABLE raffles ADD COLUMN activationDate TIMESTAMP, ADD COLUMN isFree BOOLEAN DEFAULT FALSE, ADD COLUMN \"maxPerUser\" INTEGER DEFAULT null;");
                    }
                    throw error;
                }
                console.log("Rifa salva no Supabase com sucesso.");
            } catch (err) {
                console.error("Erro ao salvar no Supabase:", err);
                const msg = err.message || "Erro desconhecido";
                if (msg.includes("activationDate") || msg.includes("isFree") || msg.includes("maxPerUser")) {
                    throw new Error("O banco de dados não está atualizado. Rode o SQL: ALTER TABLE raffles ADD COLUMN \"activationDate\" TIMESTAMP, ADD COLUMN \"isFree\" BOOLEAN DEFAULT FALSE, ADD COLUMN \"totalNumbers\" INTEGER DEFAULT 0, ADD COLUMN \"maxPerUser\" INTEGER DEFAULT null;");
                }
                throw new Error("Falha ao salvar na Nuvem: " + msg);
            }
        }

        // 2. Auto-encerrar se bater a meta/limite
        if (raffle.totalNumbers > 0) {
            const soldTotal = (await this.getNumbersSold()).filter(n => n.raffleId === raffle.id).length;
            if (soldTotal >= raffle.totalNumbers && raffle.status !== 'Encerrada') {
                raffle.status = 'Encerrada';
                // Salvar novamente com status atualizado (recursão curta)
                return await this.saveRaffle(raffle);
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
            status: 'Aguardando aprovação'
        };

        const raffles = await this.getRafflesList();
        const raffle = raffles.find(r => r.id === data.raffleId);

        if (raffle && raffle.isFree) {
            newPurchase.status = 'Aprovado';
            newPurchase.amount = 0; 

            if (raffle.maxPerUser && raffle.maxPerUser > 0) {
                const sold = await this.getNumbersSold();
                const pastPurchasesCount = sold.filter(n => n.raffleId === data.raffleId && (n.userPhone === data.userPhone || (data.userCpf !== 'Não informado' && n.userCpf === data.userCpf))).length;
                
                if ((pastPurchasesCount + parseInt(data.qty)) > raffle.maxPerUser) {
                    throw new Error(`Limite excedido para esta rifa grátis! O limite é de ${raffle.maxPerUser} número(s) por pessoa e você já tentou reservar ${pastPurchasesCount + parseInt(data.qty)}.`);
                }
            }

            // Verificação de Limite (Auto-Encerrar)
            if (raffle.totalNumbers > 0) {
                const sold = await this.getNumbersSold();
                const totalSoldForThis = sold.filter(n => n.raffleId === data.raffleId).length + parseInt(data.qty);

                if (totalSoldForThis >= raffle.totalNumbers) {
                    raffle.status = 'Encerrada';
                    await this.saveRaffle(raffle);
                }
            }
        }

        // NOVO: Gerar números imediatamente para todas as rifas (reserva)
        newPurchase.numbers = await this.generateUniqueNumbers(data.raffleId, data.qty);

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

        // TRAVA DE SEGURANÇA: Limite de tentativas (Opcional, vamos aumentar pra 5 caso algo falhe)
        const attempts = (targetPurchase.attempts || 0);
        if (attempts >= 5) {
            throw new Error("Limite de tentativas atingido. Volte amanhã ou clique em meus números para ver se chegou ou olhar o whatsapp.");
        }

        // TRAVA DE LIMITE: Verificar se ainda há números disponíveis na rifa
        const raffles = await this.getRafflesList();
        const raffle = raffles.find(r => r.id === targetPurchase.raffleId);
        if (raffle && raffle.totalNumbers > 0) {
            const sold = (await this.getNumbersSold()).filter(n => n.raffleId === raffle.id).length;
            if (sold + targetPurchase.qty > raffle.totalNumbers) {
                throw new Error(`Limite excedido! Esta rifa tem limite de ${raffle.totalNumbers} números e já foram vendidos ${sold}. Esta compra de ${targetPurchase.qty} ultrapassa o limite.`);
            }
        }

        // Gerar números APENAS se já não tiver (reserva)
        const numbers = targetPurchase.numbers && targetPurchase.numbers.length > 0 
            ? targetPurchase.numbers 
            : await this.generateUniqueNumbers(targetPurchase.raffleId, targetPurchase.qty);
        
        console.log("Números da participação:", numbers);

        const newAttempts = attempts + 1;

        if (this.useCloud && this.db) {
            const { error } = await this.db.from('purchases').update({
                status: 'Aprovado',
                numbers: numbers,
                attempts: newAttempts
            }).eq('id', purchaseId);

            if (error) {
                console.error("Erro ao atualizar status no Supabase:", error);
                // Mesmo que dê erro na nuvem (ex: erro de permissão), vamos forçar aprovar no Local para que não trave tudo.
            } else {
                console.log("Status atualizado na nuvem com sucesso.");
            }
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

        // Se bater a meta após aprovação, encerrar a rifa
        if (raffle && raffle.totalNumbers > 0) {
            const newSold = (await this.getNumbersSold()).filter(n => n.raffleId === raffle.id).length;
            if (newSold >= raffle.totalNumbers) {
                raffle.status = 'Encerrada';
                await this.saveRaffle(raffle);
            }
        }

        return true;
    },

    async getRaffleProgress(raffleId) {
        const raffles = await this.getRafflesList();
        const raffle = raffles.find(r => r.id === raffleId);
        if (!raffle || !raffle.totalNumbers || raffle.totalNumbers <= 0) return 0;

        const sold = (await this.getNumbersSold()).filter(n => n.raffleId === raffleId).length;
        const percent = (sold / raffle.totalNumbers) * 100;
        return Math.min(100, Math.round(percent));
    },

    async getAvailableSpots(raffleId) {
        const raffles = await this.getRafflesList();
        const raffle = raffles.find(r => r.id === raffleId);
        if (!raffle || !raffle.totalNumbers || raffle.totalNumbers <= 0) return 999999; 

        const sold = (await this.getNumbersSold()).filter(n => n.raffleId === raffleId).length;
        return Math.max(0, raffle.totalNumbers - sold);
    },

    async getTopRankings() {
        const purchases = await this.getPurchases();
        const approvedOnes = purchases.filter(p => ['Aprovado', 'Confirmado', 'PAGAMENTO APROVADO'].includes(p.status));
        
        const rankMap = {};
        approvedOnes.forEach(p => {
            const name = p.userName || 'Anônimo';
            const count = parseInt(p.qty || 0);
            if (!rankMap[name]) rankMap[name] = 0;
            rankMap[name] += count;
        });

        return Object.entries(rankMap)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    },

    async showRankingModal() {
        const winners = await this.getTopRankings();
        const icons = ['🥇', '🥈', '🥉', '👤', '👤'];
        
        const rankingHtml = winners.length > 0 ? winners.map((w, i) => `
            <div class="ranking-item glass" style="display:flex; align-items:center; justify-content:space-between; padding:12px 20px; border-radius:16px; border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02); margin-bottom:10px;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:20px;">${icons[i] || '👤'}</span>
                    <div>
                        <div style="font-weight:700; color:#fff; font-size:14px;">${w.name}</div>
                        <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase;">Doador de Skins</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:800; color:var(--accent-primary); font-size:16px;">${w.count}</div>
                    <div style="font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;">Cotas</div>
                </div>
            </div>
        `).join('') : '<div style="text-align:center;color:var(--text-dim);padding:20px;">O ranking será atualizado em breve.</div>';

        const modalHtml = `
            <div id="rankingModal" class="pix-modal-overlay" style="z-index: 10001;">
                <div class="pix-modal" style="max-width:450px; border-radius:24px; border:2px solid var(--accent-primary);">
                    <div style="text-align:center; margin-bottom:25px;">
                        <h3 style="font-size:24px; font-weight:800; color:#fff; margin-bottom:5px;">
                            <i data-lucide="trophy" style="color:var(--accent-primary); vertical-align:middle; margin-right:8px;"></i>
                            Top Compradores
                        </h3>
                        <p style="font-size:13px; color:var(--text-dim);">Os maiores colecionadores da Dollyn Storm</p>
                    </div>
                    
                    <div style="max-height:400px; overflow-y:auto; padding-right:5px;">
                        ${rankingHtml}
                    </div>
                    
                    <button class="premium-btn full" onclick="document.getElementById('rankingModal').remove()" style="margin-top:20px;">Fechar Ranking</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
        
        const modal = document.getElementById('rankingModal');
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    },

    async showRaffleRankingModal(raffleId, raffleName) {
        const purchases = await this.getPurchases();
        const icons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

        // Filtrar compras (qualquer status) para esta rifa específica
        const rafflePurchases = purchases.filter(p => p.raffleId === raffleId);

        // Montar ranking por nome/CPF
        const rankMap = {};
        rafflePurchases.forEach(p => {
            const key = p.userCpf && p.userCpf !== 'Não informado' ? p.userCpf : p.userName;
            if (!rankMap[key]) rankMap[key] = { name: p.userName || 'Anônimo', count: 0 };
            rankMap[key].count += parseInt(p.qty || 0);
        });

        const topBuyers = Object.values(rankMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        const rankingHtml = topBuyers.length > 0 ? topBuyers.map((w, i) => {
            const isTop3 = i < 3;
            const bgColor = i === 0 ? 'rgba(255,215,0,0.08)' : i === 1 ? 'rgba(192,192,192,0.08)' : i === 2 ? 'rgba(205,127,50,0.08)' : 'rgba(255,255,255,0.02)';
            const borderColor = i === 0 ? 'rgba(255,215,0,0.3)' : i === 1 ? 'rgba(192,192,192,0.2)' : i === 2 ? 'rgba(205,127,50,0.2)' : 'rgba(255,255,255,0.05)';
            const nameColor = i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff';
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:${isTop3 ? '14px 18px' : '11px 16px'}; border-radius:14px; border:1px solid ${borderColor}; background:${bgColor}; margin-bottom:8px; transition: transform 0.15s;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span style="font-size:${isTop3 ? '22px' : '17px'}; min-width:28px; text-align:center;">${icons[i] || '👤'}</span>
                    <div>
                        <div style="font-weight:${isTop3 ? '800' : '600'}; color:${nameColor}; font-size:${isTop3 ? '15px' : '13px'};">${w.name}</div>
                        <div style="font-size:10px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.5px;">${i === 0 ? 'Líder da rifa' : i < 3 ? 'Top comprador' : 'Participante'}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:900; color:${i < 3 ? nameColor : 'var(--accent-primary)'}; font-size:${isTop3 ? '20px' : '16px'};">${w.count}</div>
                    <div style="font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:1px;">cotas</div>
                </div>
            </div>
        `}).join('') : `<div style="text-align:center; padding:30px 20px;">
            <div style="font-size:40px; margin-bottom:12px;">🎯</div>
            <div style="color:var(--text-dim); font-size:14px;">Seja o primeiro a entrar no ranking!<br>Esta rifa ainda não tem compradores.</div>
        </div>`;

        const modalHtml = `
            <div id="raffleRankingModal" class="pix-modal-overlay" style="z-index: 10002;">
                <div class="pix-modal" style="max-width:460px; border-radius:24px; border:2px solid rgba(255,215,0,0.4); background: linear-gradient(160deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div style="font-size:36px; margin-bottom:8px;">🏆</div>
                        <h3 style="font-size:20px; font-weight:900; color:#fff; margin-bottom:4px; line-height:1.2;">Top Compradores</h3>
                        <p style="font-size:12px; color:#ffd700; font-weight:600; background:rgba(255,215,0,0.1); border:1px solid rgba(255,215,0,0.2); border-radius:20px; padding:4px 14px; display:inline-block; margin-top:4px;">${raffleName || 'Esta Rifa'}</p>
                    </div>
                    
                    <div style="max-height:380px; overflow-y:auto; padding-right:4px; scrollbar-width:thin; scrollbar-color:rgba(255,215,0,0.3) transparent;">
                        ${rankingHtml}
                    </div>
                    
                    <button class="premium-btn full" onclick="document.getElementById('raffleRankingModal').remove()" style="margin-top:18px; background: linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,165,0,0.1)); border: 1px solid rgba(255,215,0,0.3); color: #ffd700;">Fechar Ranking</button>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();

        const modal = document.getElementById('raffleRankingModal');
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    },

    async getStats() {
        const purchases = await this.getPurchases();
        // Apenas contas confirmadas ou com PIX gerado (que o admin vê como venda potencial)
        const validPurchases = purchases.filter(p => ['Aguardando aprovação', 'Aprovado', 'Confirmado'].includes(p.status));
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
        if (this._rendering) return;
        this._rendering = true;

        requestAnimationFrame(() => {
            const isAdmin = this.isAdmin();
            const user = this.getCurrentUser();
            const stateKey = `${isAdmin}-${user?.email || 'none'}`;

            if (this.lastRenderedState === stateKey && document.querySelector('.mobile-bottom-nav')) {
                this._rendering = false;
                return;
            }

            const desktopNav = document.querySelector('.desktop-nav ul');
            const sidebarNav = document.querySelector('.sidebar-nav ul');
            const navActions = document.getElementById('navActions');
            
            // Clean up existing mobile navs to prevent duplicates
            document.querySelectorAll('.mobile-bottom-nav').forEach(el => el.remove());

            const isAdminPage = window.location.pathname.includes('admin.html');
            const isLoginPage = window.location.pathname.includes('login.html');

            // Check if we are on a page that should have a navbar
            if (!document.body || isAdminPage || isLoginPage) {
                this._rendering = false;
                return;
            }

            // Create new floating pill navbar
            const bottomNav = document.createElement('nav');
            bottomNav.className = 'mobile-bottom-nav';
            
            const isHome = window.location.pathname.includes('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
            const isDashboard = window.location.pathname.includes('dashboard.html');
            const isTerms = window.location.pathname.includes('termos-de-uso.html');
            const isWinners = window.location.pathname.includes('ganhadores.html');

            const navItems = [
                { id: 'home', label: 'Início', href: 'index.html', icon: 'home', active: isHome },
                { id: 'rifas', label: 'Rifas', href: isHome ? '#campanhas' : 'index.html#campanhas', icon: 'ticket', active: false },
                { id: 'meus', label: 'Meus Números', href: 'dashboard.html', icon: 'hash', active: isDashboard },
                { id: 'termos', label: 'Termos', href: 'termos-de-uso.html', icon: 'file-text', active: isTerms },
                { id: 'rank', label: 'Ranking', href: 'javascript:DataService.showRankingModal()', icon: 'trophy', active: false },
                { 
                    id: 'conta', 
                    label: user ? user.name.split(' ')[0] : 'Login', 
                    href: user ? 'dashboard.html' : 'login.html', 
                    icon: 'user', 
                    active: false 
                }
            ];

            const navItemsHtml = navItems.map(item => `
                <a href="${item.href}" class="mobile-nav-item ${item.active ? 'active' : ''} ${item.id === 'conta' && user ? 'user-nav-item' : ''}">
                    <i data-lucide="${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            `).join('');

            bottomNav.innerHTML = `
                <div class="mobile-nav-items">
                    ${navItemsHtml}
                </div>
            `;

            document.body.appendChild(bottomNav);

            // Desktop Nav fallback
            const desktopItemsHtml = navItems.map(m => `<li><a href="${m.href}">${m.label}</a></li>`).join('');
            if (desktopNav) desktopNav.innerHTML = desktopItemsHtml;
            
            // Sidebar fallback (though hidden on mobile now)
            if (sidebarNav) {
                let sidebarHtml = desktopItemsHtml;
                if (isAdmin) sidebarHtml += `<li><a href="admin.html" style="color:var(--accent-primary)">Painel Admin</a></li>`;
                if (user) sidebarHtml += `<li><a href="#" onclick="DataService.logout()">Sair da Conta</a></li>`;
                sidebarNav.innerHTML = sidebarHtml;
            }

            if (navActions) {
                let actionsHtml = '';
                if (user) actionsHtml += `<span class="user-greeting">Olá, ${user.name.split(' ')[0]}</span>`;
                actionsHtml += `<button class="menu-toggle" id="menuToggle" aria-label="Abrir Menu"><span></span><span></span><span></span></button>`;
                navActions.innerHTML = actionsHtml;
                if (window.MainApp && window.MainApp.setupToggles) window.MainApp.setupToggles();
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
