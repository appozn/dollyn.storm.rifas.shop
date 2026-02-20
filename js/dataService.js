/**
 * Dollyn Storm - Data & Auth Service
 * Persistent storage logic using localStorage to simulate a database.
 */

const DataService = {
    KEYS: {
        USERS: 'ds_users',
        PURCHASES: 'ds_purchases',
        NUMBERS: 'ds_numbers',
        RAFFLES: 'ds_raffles',
        CURRENT_USER: 'ds_current_user',
        ADMIN_AUTH: 'ds_admin_auth',
        RAFFLES_LIST: 'ds_raffles_list'
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

    // --- Data Management ---
    getUsers() {
        return JSON.parse(localStorage.getItem(this.KEYS.USERS) || '[]');
    },

    getPurchases() {
        return JSON.parse(localStorage.getItem(this.KEYS.PURCHASES) || '[]');
    },

    getNumbersSold() {
        const purchases = this.getPurchases();
        const allNumbers = [];
        purchases.forEach(p => {
            p.numbers.forEach(num => {
                allNumbers.push({
                    number: num,
                    userName: p.userName,
                    userCpf: p.userCpf,
                    userPhone: p.userPhone,
                    raffleId: p.raffleId,
                    raffleName: p.raffleName
                });
            });
        });
        return allNumbers;
    },

    getLotteryData() {
        return JSON.parse(localStorage.getItem(this.KEYS.RAFFLES) || '[]');
    },

    getRafflesList() {
        const raffles = JSON.parse(localStorage.getItem(this.KEYS.RAFFLES_LIST) || '[]');
        if (raffles.length === 0) {
            return [{
                id: 'test-raffle',
                name: 'Produto Teste',
                description: 'Participe do sorteio e concorra a uma skin exclusiva.',
                imageUrl: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?q=80&w=2070&auto=format&fit=crop',
                price: 0.50,
                minQty: 5,
                status: 'Ativa'
            }];
        }
        return raffles;
    },

    saveRaffle(raffle) {
        if (!raffle.imageUrl) throw new Error("Imagem é obrigatória.");
        const raffles = this.getRafflesList().filter(r => r.id !== raffle.id);
        raffles.push(raffle);
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));
    },

    deleteRaffle(id) {
        let raffles = this.getRafflesList();
        raffles = raffles.filter(r => r.id !== id);
        localStorage.setItem(this.KEYS.RAFFLES_LIST, JSON.stringify(raffles));
    },

    saveWinner(winner) {
        const winners = this.getLotteryData();
        winners.push({
            ...winner,
            date: winner.date || new Date().toLocaleString('pt-BR')
        });
        localStorage.setItem(this.KEYS.RAFFLES, JSON.stringify(winners));
    },

    // --- Critical Payment & Number Flow (Stages 1-4) ---
    generateUniqueNumbers(raffleId, qty) {
        const purchases = this.getPurchases();
        const soldNumbers = new Set();

        // Collect all numbers already sold for THIS specific raffle
        purchases.filter(p => p.raffleId === raffleId).forEach(p => {
            if (p.numbers) p.numbers.forEach(n => soldNumbers.add(n));
        });

        const newNumbers = [];
        while (newNumbers.length < qty) {
            // Generate 5-digit number (00000-99999)
            const num = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
            if (!soldNumbers.has(num) && !newNumbers.includes(num)) {
                newNumbers.push(num);
            }
        }
        return newNumbers;
    },

    completePurchase(data) {
        // Stage 6: Safety Guards
        if (!data.raffleId || !data.qty || !data.userName || !data.userPhone) {
            throw new Error("Dados insuficientes para completar a compra.");
        }

        // ETAPA 2: Geração Automática (Obrigatória)
        const generatedNumbers = this.generateUniqueNumbers(data.raffleId, data.qty);

        // ETAPA 3: Salvamento no "Banco" (localStorage)
        const purchases = this.getPurchases();
        const newPurchase = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            raffleId: data.raffleId,
            raffleName: data.raffleName || 'Rifa de Skin',
            userName: data.userName,
            userCpf: data.userCpf || 'Não informado',
            userPhone: data.userPhone,
            amount: data.amount,
            qty: data.qty,
            numbers: generatedNumbers,
            date: new Date().toLocaleString('pt-BR'),
            status: 'Confirmado'
        };

        // ETAPA 4: Vincular ao Perfil do Usuário
        // Salva a compra globalmente
        purchases.push(newPurchase);
        localStorage.setItem(this.KEYS.PURCHASES, JSON.stringify(purchases));

        // Atualiza estatísticas do usuário se ele estiver logado
        const currentUser = this.getCurrentUser();
        if (currentUser && currentUser.phone === data.userPhone) {
            const users = this.getUsers();
            const idx = users.findIndex(u => u.phone === currentUser.phone);
            if (idx !== -1) {
                users[idx].purchases = users[idx].purchases || [];
                users[idx].purchases.push(newPurchase.id);
                localStorage.setItem(this.KEYS.USERS, JSON.stringify(users));
            }
        }

        return newPurchase;
    },

    // Stats for Dashboard
    getStats() {
        const purchases = this.getPurchases();
        const users = this.getUsers();
        const totalNumbers = purchases.reduce((sum, p) => sum + (p.numbers ? p.numbers.length : 0), 0);
        const totalRevenue = purchases.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

        return {
            totalRevenue: totalRevenue.toFixed(2),
            totalPurchases: purchases.length,
            totalUsers: users.length,
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

        // Add Bottom Nav Container if it doesn't exist
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
                <li><a href="${m.href}" class="${window.location.pathname.includes(m.href) ? 'active' : ''}">${m.label}</a></li>
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
                <a href="${m.href}" class="mobile-nav-item ${window.location.pathname.includes(m.href) ? 'active' : ''}">
                    <i data-lucide="${m.icon}"></i>
                    <span>${m.label}</span>
                </div>
            `).join('');
        }

        if (adminNav) {
            adminNav.innerHTML = `
                <li><a href="admin.html#dashboard"><i data-lucide="layout-dashboard"></i> Dashboard</a></li>
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

            const toggle = navActions.querySelector('#menuToggle');
            if (toggle) {
                toggle.onclick = () => {
                    document.getElementById('sidebar')?.classList.add('open');
                    document.getElementById('overlay')?.classList.add('show');
                };
            }
        }

        if (window.lucide) lucide.createIcons();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    DataService.renderMenu();
});
