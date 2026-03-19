/**
 * Dollyn Storm - CS Skins Raffle Service
 * 100% Official PIX (EMV-Co) Generator & Identification Flow
 */


const PixGenerator = {
    // CRC16-CCITT (0x1021) calculation - standard for PIX (BRCode)
    crc16(data) {
        let crc = 0xFFFF;
        const polynomial = 0x1021;
        for (let i = 0; i < data.length; i++) {
            crc ^= data.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                if (crc & 0x8000) {
                    crc = (crc << 1) ^ polynomial;
                } else {
                    crc <<= 1;
                }
            }
        }
        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    },

    formatTLV(id, value) {
        const len = value.length.toString().padStart(2, '0');
        return id + len + value;
    },

    generatePayload(key, amount, name = "DOLLYNSTORM", city = "BRASILIA") {
        const amountStr = parseFloat(amount).toFixed(2);

        // 26 - Merchant Account Information (PIX)
        const gui = this.formatTLV("00", "BR.GOV.BCB.PIX");
        const keyField = this.formatTLV("01", key);
        const merchantInfo = this.formatTLV("26", gui + keyField);

        let sections = [
            this.formatTLV("00", "01"), // Payload Indicator
            merchantInfo,
            this.formatTLV("52", "0000"), // Category
            this.formatTLV("53", "986"), // Currency
            this.formatTLV("54", amountStr), // Amount
            this.formatTLV("58", "BR"), // Country
            this.formatTLV("59", name.substring(0, 25).toUpperCase()), // Name
            this.formatTLV("60", city.substring(0, 15).toUpperCase()), // City
            this.formatTLV("62", this.formatTLV("05", "***")), // Additional Data (TXID)
        ];

        let payload = sections.join("") + "6304";
        payload += this.crc16(payload);
        return payload;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Consolidate UI Toggles
    const setupToggles = () => {
        const menuToggle = document.getElementById('menuToggle');
        const closeSidebar = document.getElementById('closeSidebar');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('overlay');

        if (!menuToggle || !sidebar || !overlay) return;

        const toggleSidebar = (show) => {
            if (show) {
                sidebar.classList.add('open');
                overlay.classList.add('show');
                document.body.style.overflow = 'hidden';
            } else {
                sidebar.classList.remove('open');
                overlay.classList.remove('show');
                document.body.style.overflow = '';
            }
        };

        // Remove old listeners to avoid duplicates
        const newMenuToggle = menuToggle.cloneNode(true);
        menuToggle.parentNode.replaceChild(newMenuToggle, menuToggle);

        newMenuToggle.addEventListener('click', () => toggleSidebar(true));
        if (closeSidebar) closeSidebar.onclick = () => toggleSidebar(false);
        overlay.onclick = () => toggleSidebar(false);

        document.querySelectorAll('.sidebar-nav a').forEach(link => {
            link.onclick = () => toggleSidebar(false);
        });
    };
    window.MainApp = window.MainApp || {};
    window.MainApp.setupToggles = setupToggles;

    setupToggles();

    // Optimized Scroll Effect (Throttled)
    let scrollTimeout;
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (scrollTimeout) return;
        scrollTimeout = setTimeout(() => {
            const isScrolled = window.scrollY > 20;
            header?.classList.toggle('scrolled', isScrolled);
            if (isScrolled) {
                header.style.backgroundColor = 'rgba(10, 10, 11, 0.95)';
                header.style.padding = '10px 0';
            } else {
                header.style.backgroundColor = 'rgba(10, 10, 11, 0.8)';
                header.style.padding = '15px 0';
            }
            scrollTimeout = null;
        }, 50);
    }, { passive: true });

    // Dynamic Campaign Rendering (Optimized)
    let lastCampaignsState = '';
    const renderCampaignCards = async () => {
        const grid = document.getElementById('campaignGrid');
        if (!grid) return;

        const raffles = await DataService.getRafflesList();
        raffles.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const stateKey = JSON.stringify(raffles.map(r => r.id + r.status));
        if (lastCampaignsState === stateKey) return;

        requestAnimationFrame(async () => {
            const rafflesHtml = await Promise.all(raffles.map(async r => {
                const progress = await DataService.getRaffleProgress(r.id);
                const isSoldOut = r.status === 'Encerrada' || (r.totalNumbers > 0 && progress >= 100);

                return `
                <div class="raffle-card ${isSoldOut ? 'sold-out' : ''}" data-raffle-id="${r.id}" data-unit-price="${r.price}" data-min-qty="${r.minQty}" data-is-free="${!!r.isFree}" data-max-per-user="${r.maxPerUser || ''}">
                    <div class="card-image">
                        <img src="${r.imageUrl}" alt="${r.name}" loading="lazy">
                        <div class="status-badge">${isSoldOut ? 'Esgotado' : 'Aberto'}</div>
                    </div>
                    <div class="card-body">
                        <div class="card-meta flex justify-between align-center">
                            <span class="product-type">Rifa de Skin CS</span>
                            <span class="unit-price-tag">Valor: R$ ${parseFloat(r.price).toFixed(2).replace('.', ',')}</span>
                        </div>
                        <h3>${r.name}</h3>
                        <p class="card-subtitle">${r.description}</p>

                        ${r.totalNumbers > 0 ? `
                        <div class="progress-container" style="margin: 15px 0;">
                            <div class="flex justify-between align-center" style="margin-bottom: 6px; font-size: 12px;">
                                <span style="color: var(--text-dim);">Progresso</span>
                                <span style="color: var(--accent-primary); font-weight: 700;">${progress}%</span>
                            </div>
                            <div class="progress-bar-bg" style="width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div class="progress-bar-fill" style="width: ${progress}%; height: 100%; background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary)); transition: width 0.5s ease;"></div>
                            </div>
                        </div>
                        ` : ''}

                        <div class="quantity-selector-container" ${isSoldOut ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                            <div class="flex align-center justify-between" style="margin-bottom: 8px;">
                                <span class="label">Quantidade</span>
                                <span class="min-qty-hint">(Mín ${r.minQty})</span>
                            </div>
                            <div class="quantity-controls flex align-center justify-between gap-10">
                                <button class="qty-shortcut" onclick="MainApp.updateQty('${r.id}', -5)">-5</button>
                                <button class="qty-btn" onclick="MainApp.updateQty('${r.id}', -1)"><i data-lucide="minus"></i></button>
                                <span class="qty-value" id="qty-${r.id}">${r.minQty}</span>
                                <button class="qty-btn" onclick="MainApp.updateQty('${r.id}', 1)"><i data-lucide="plus"></i></button>
                                <button class="qty-shortcut" onclick="MainApp.updateQty('${r.id}', 5)">+5</button>
                                <button class="qty-btn" style="padding: 0 8px;" onclick="MainApp.editQty('${r.id}')" title="Editar quantidade"><i data-lucide="pencil" style="width: 16px; height: 16px;"></i></button>
                            </div>
                        </div>

                        <div class="card-footer">
                            <div class="total-price-display">
                                <span class="label">Total:</span>
                                <span class="price" id="total-${r.id}">R$ ${(r.minQty * r.price).toFixed(2).replace('.', ',')}</span>
                            </div>
                            <button class="premium-btn" ${isSoldOut ? 'disabled' : ''} onclick="MainApp.buyRaffle('${r.id}')">${isSoldOut ? 'Encerrada' : 'Participar'}</button>
                        </div>
                    </div>
                </div>
            `;
            }));

            grid.innerHTML = rafflesHtml.join('');
            if (window.lucide) lucide.createIcons();
            lastCampaignsState = stateKey;
        });
    };

    renderCampaignCards();

    renderCampaignCards();

    // Consolidated Storage Listener
    window.addEventListener('storage', () => {
        renderCampaignCards();
        if (typeof DataService !== 'undefined') {
            DataService.renderMenu();
        }
    });

    // Globals for dynamic interaction
    Object.assign(window.MainApp, {
        async editQty(raffleId) {
            const qtyEl = document.getElementById(`qty-${raffleId}`);
            const totalEl = document.getElementById(`total-${raffleId}`);
            const card = document.querySelector(`.raffle-card[data-raffle-id="${raffleId}"]`);

            if (!qtyEl || !card) return;

            const unitPrice = parseFloat(card.dataset.unitPrice);
            const minQty = parseInt(card.dataset.minQty);
            const available = await DataService.getAvailableSpots(raffleId);

            const input = prompt(`Digite a quantidade desejada (Mín: ${minQty}, Disponível: ${available}):`);
            if (input === null || input.trim() === '') return;

            const newQty = parseInt(input, 10);

            if (isNaN(newQty)) {
                alert("Por favor, insira um número válido.");
                return;
            }

            if (newQty < minQty) {
                alert(`A quantidade mínima é ${minQty}.`);
                return;
            }

            const maxPerUser = card.dataset.maxPerUser ? parseInt(card.dataset.maxPerUser) : null;
            if (maxPerUser && newQty > maxPerUser) {
                alert(`O limite máximo para esta rifa é de ${maxPerUser} número(s) por pessoa.`);
                return;
            }

            if (newQty > available) {
                alert("Quantidade Limitada");
                return;
            }

            qtyEl.textContent = newQty;
            totalEl.textContent = `R$ ${(newQty * unitPrice).toFixed(2).replace('.', ',')}`;
        },

        async updateQty(raffleId, delta) {
            const qtyEl = document.getElementById(`qty-${raffleId}`);
            const totalEl = document.getElementById(`total-${raffleId}`);
            const card = document.querySelector(`.raffle-card[data-raffle-id="${raffleId}"]`);

            if (!qtyEl || !card) return;

            const unitPrice = parseFloat(card.dataset.unitPrice);
            const minQty = parseInt(card.dataset.minQty);
            let currentQty = parseInt(qtyEl.textContent);

            const newQty = currentQty + delta;
            
            if (newQty < minQty) {
                alert(`A quantidade mínima é ${minQty}.`);
                return;
            }

            const maxPerUser = card.dataset.maxPerUser ? parseInt(card.dataset.maxPerUser) : null;
            if (maxPerUser && newQty > maxPerUser) {
                alert(`O limite máximo para esta rifa é de ${maxPerUser} número(s) por pessoa.`);
                return;
            }

            // Verificar limite máximo (Meta)
            const available = await DataService.getAvailableSpots(raffleId);
            if (newQty > available) {
                alert(`Ops! Só restam ${available} números disponíveis para esta rifa. A meta está quase batida!`);
                return;
            }

            qtyEl.textContent = newQty;
            totalEl.textContent = `R$ ${(newQty * unitPrice).toFixed(2).replace('.', ',')}`;
        },

        async buyRaffle(raffleId) {
            const raffles = await DataService.getRafflesList();
            const raffle = raffles.find(r => r.id === raffleId);
            
            if (!raffle || (raffle.status !== 'Ativa' && raffle.status !== 'Disponível' && !DataService.isAdmin())) {
                alert("Esta rifa não está disponível para compra no momento.");
                return;
            }

            const card = document.querySelector(`.raffle-card[data-raffle-id="${raffleId}"]`);
            if (!card) return;
            const unitPrice = parseFloat(card.dataset.unitPrice);
            const isFree = card.dataset.isFree === 'true';

            const qtyEl = document.getElementById(`qty-${raffleId}`);
            const currentQty = qtyEl ? parseInt(qtyEl.textContent) : 1;
            
            // Verificação final antes de processar
            DataService.getAvailableSpots(raffleId).then(available => {
                if (currentQty > available) {
                    alert(`Limite atingido! Não é possível comprar ${currentQty} números. Disponíveis: ${available}`);
                    return;
                }
                const total = isFree ? "0.00" : (currentQty * unitPrice).toFixed(2);
                window.currentRaffleId = raffleId;
                window.currentRaffleName = card.querySelector('h3').textContent;

                // NOVO: Verificar se o usuário já está logado
                const loggedUser = DataService.getCurrentUser();
                if (loggedUser) {
                    if (isFree) {
                        showSuccessFeedback(total, currentQty, loggedUser.name, loggedUser.phone, loggedUser.cpf);
                        processPurchase(total, currentQty, loggedUser.name, loggedUser.phone, loggedUser.cpf);
                    } else {
                        showPixModal(total, currentQty, loggedUser.name, loggedUser.phone, loggedUser.cpf);
                    }
                } else {
                    // Se não estiver logado, pede identificação normalmente
                    showIdentityModal(total, currentQty, isFree);
                }
            });
        }
    });

    function showIdentityModal(amount, qty, isFree = false) {
        const modalHtml = `
            <div id="idModal" class="pix-modal-overlay">
                <div class="pix-modal" style="max-width:400px;border-radius:24px;border:2px solid var(--accent-primary);">
                    <h3 style="font-size:22px;color:var(--accent-primary);">${isFree ? 'Participar Gratuitamente' : 'v2.0 - Identificação Requerida'}</h3>
                    <p style="margin-bottom:25px;font-size:14px;color:var(--text-muted);">${isFree ? 'Informe seus dados para receber seus números da sorte gratuitos.' : 'Para sua segurança, informe Nome, CPF e WhatsApp para vincular seus números.'}</p>
                    <div class="form-group" style="margin-bottom:15px;text-align:left;">
                        <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-dim);font-weight:600;">NOME COMPLETO</label>
                        <input type="text" id="userName" placeholder="Ex: João Silva" style="width:100%;padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:10px;color:#fff;outline:none;">
                    </div>
                    <div class="form-group" style="margin-bottom:15px;text-align:left;">
                        <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-dim);font-weight:600;">CPF (OBRIGATÓRIO)</label>
                        <input type="text" id="userCpf" placeholder="000.000.000-00" style="width:100%;padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:10px;color:#fff;outline:none;">
                    </div>
                    <div class="form-group" style="margin-bottom:25px;text-align:left;">
                        <label style="display:block;margin-bottom:8px;font-size:12px;color:var(--text-dim);font-weight:600;">WHATSAPP (TELEFONE)</label>
                        <input type="text" id="userPhone" placeholder="(00) 00000-0000" style="width:100%;padding:14px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:10px;color:#fff;outline:none;">
                    </div>

                    <button onclick="DataService.showRaffleRankingModal(window.currentRaffleId||'', window.currentRaffleName||'esta rifa')" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:12px;margin-bottom:16px;background:rgba(139,92,246,0.1);border:1.5px solid rgba(139,92,246,0.45);border-radius:12px;color:#a78bfa;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.2s;letter-spacing:0.5px;" onmouseover="this.style.background='rgba(139,92,246,0.18)'" onmouseout="this.style.background='rgba(139,92,246,0.1)'">
                        <i data-lucide="trophy" style="width:16px;height:16px;"></i> Ver Ranking desta Rifa
                    </button>

                    <!-- Stage 1: Terms Checkbox -->
                    <div style="text-align:left; margin-bottom:20px; font-size:13px; color:var(--text-muted); display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" id="acceptTerms" style="width:18px; height:18px; cursor:pointer;">
                        <label for="acceptTerms">Li e aceito os <a href="termos-de-uso.html" target="_blank" id="viewTermsLink" style="color:var(--accent-primary); text-decoration:underline;">termos da plataforma</a>.</label>
                    </div>

                    <div style="display: flex; justify-content: center; width: 100%;">
                        <button class="premium-btn full" id="proceedToPayBtn" style="padding:16px;">${isFree ? 'Participar da Rifa' : 'Gerar Pagamento PIX'}</button>
                    </div>
                    <button class="close-modal" id="closeIdModal" style="margin-top:10px;border:none;font-size:13px;text-decoration:underline;">Cancelar e voltar</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('closeIdModal').addEventListener('click', () => document.getElementById('idModal').remove());

        // Modal de Termos - Removido bloqueio para abrir página diretamente

        document.getElementById('proceedToPayBtn').addEventListener('click', () => {
            const name = document.getElementById('userName').value;
            const cpf = document.getElementById('userCpf').value;
            const phone = document.getElementById('userPhone').value;
            const accepted = document.getElementById('acceptTerms').checked;

            if (!accepted) {
                alert('Você precisa aceitar os termos da plataforma para continuar.');
                return;
            }

            if (name.length < 3) {
                alert('Por favor, informe seu nome completo.');
                return;
            }

            if (!DataService.validateCPF(cpf)) {
                alert('Por favor, informe um CPF válido.');
                return;
            }

            if (phone.length < 8) {
                alert('Por favor, informe seu WhatsApp corretamente.');
                return;
            }

            document.getElementById('idModal').remove();
            if (isFree) {
                // Pular modal PIX e ir direto para o processamento
                showSuccessFeedback(amount, qty, name, phone, cpf); // Função auxiliar para feedback visual
                processPurchase(amount, qty, name, phone, cpf);
            } else {
                showPixModal(amount, qty, name, phone, cpf);
            }
        });
    }

    // Função auxiliar para mostrar o feedback sem precisar do showPixModal
    function showSuccessFeedback(amount, qty, name, phone, cpf) {
        const modalHtml = `
            <div id="pixModal" class="pix-modal-overlay">
                <div class="pix-modal">
                    <div class="loader-container" style="padding:40px;text-align:center;">
                        <i data-lucide="loader" class="animate-spin" style="width:40px;height:40px;color:var(--accent-primary);"></i>
                        <p style="margin-top:20px;">Processando sua participação gratuita...</p>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();
    }

    function showPixModal(amount, qty, name, phone, cpf) {
        const pixKey = "57130513000134";
        const payload = PixGenerator.generatePayload(pixKey, amount);

        const modalHtml = `
            <div id="pixModal" class="pix-modal-overlay">
                <div class="pix-modal">
                    <h3>Finalize o Pagamento</h3>
                    <p>Total Skin: <span class="highlight">R$ ${amount.replace('.', ',')}</span> (${qty} cotas)</p>
                    <div class="qr-code">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(payload)}" alt="QR Code PIX">
                    </div>
                    <div class="pix-key-container">
                        <input type="text" value="${payload}" id="pixCopyKey" readonly>
                        <button onclick="copyPixFull()">Copiar Chave</button>
                    </div>
                    <p class="timer"><i data-lucide="clock" style="width:14px;height:14px"></i> Pagamento via PIX rápido e seguro...</p>
                    <button class="premium-btn full" id="confirmPaymentBtn">Confirmar Pagamento</button>
                    <button class="close-modal" id="closePixModal" style="margin-top:10px">Cancelar</button>
                    <p style="font-size:11px;color:var(--accent-primary);margin-top:10px;">ID Comprador: ${name} | CPF: ${cpf}</p>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (window.lucide) lucide.createIcons();

        document.getElementById('closePixModal').addEventListener('click', () => document.getElementById('pixModal').remove());

        document.getElementById('confirmPaymentBtn').addEventListener('click', () => {
            processPurchase(amount, qty, name, phone, cpf);
        });
    }

    async function processPurchase(amount, qty, name, phone, cpf) {
        try {
            // ETAPA 1, 2, 3 e 4: Gerar, Salvar (status Pendente - aguardando confirmação admin)
            const purchase = await DataService.completePurchase({
                raffleId: window.currentRaffleId || 'test-raffle',
                raffleName: window.currentRaffleName || 'Produto Teste',
                userName: name,
                userPhone: phone,
                userCpf: cpf,
                amount: amount,
                qty: qty
            });

            // Gerar mensagem WhatsApp com os números
            const numbersText = purchase.numbers.map(n => '#' + n).join(', ');
            const whatsappMsg = encodeURIComponent(
                `🎉 Olá ${name}! Seu pagamento foi registrado na Dollyn Storm Rifas!\n\n` +
                `📋 Rifa: ${purchase.raffleName}\n` +
                `🔢 Seus números: ${numbersText}\n\n` +
                `⏳ Aguarde a confirmação do pagamento pelo administrador para validar sua participação.\n` +
                `Boa sorte! 🍀`
            );
            const cleanPhone = phone.replace(/\D/g, '');
            const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${whatsappMsg}`;

            // ETAPA 5: Confirmação Visual — compra PENDENTE até admin confirmar
            const modal = document.querySelector('.pix-modal');
            modal.innerHTML = `
                <div class="success-icon" style="margin-bottom:20px;">
                    <i data-lucide="${purchase.status === 'Aprovado' ? 'check-circle' : 'clock'}" style="width:64px;height:64px;color:${purchase.status === 'Aprovado' ? '#10b981' : '#f59e0b'}"></i>
                </div>
                <h3 style="font-size:22px;margin-bottom:10px;color:${purchase.status === 'Aprovado' ? '#10b981' : '#f59e0b'};">${purchase.status === 'Aprovado' ? 'Participação Confirmada!' : 'Pagamento Enviado!'}</h3>
                <p style="color:var(--text-muted);margin-bottom:5px;font-size:14px;">${purchase.status === 'Aprovado' ? 'Você já está participando da rifa!' : 'Seus números foram reservados. <strong>O acesso será liberado após a confirmação do pagamento pelo administrador.</strong>'}</p>

                <div class="numbers-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:150px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:16px;border-radius:15px;margin:20px 0;border:1px solid var(--border-color);">
                    ${purchase.numbers.map(n => `<span class="num-chip" style="margin:0;font-size:13px;opacity:0.6;">#${n}</span>`).join('')}
                </div>

                <p style="font-size:12px;color:var(--text-dim);margin-bottom:20px;">📲 Envie seus números pelo WhatsApp para guardar o comprovante:</p>

                <a href="${whatsappUrl}" target="_blank" class="premium-btn full" style="padding:16px;background:linear-gradient(135deg,#25d366,#128c7e);display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:12px;">
                    <i data-lucide="smartphone" style="width:18px;height:18px;"></i> Enviar Números pelo WhatsApp
                </a>
                <button class="close-modal" onclick="document.getElementById('pixModal').remove()" style="margin-top:5px;border:none;font-size:13px;text-decoration:underline;">Fechar</button>
            `;

            if (window.lucide) lucide.createIcons();

        } catch (error) {
            // Remove o loader modal se ele existir e fechar antes de dar erro
            const modal = document.getElementById('pixModal');
            if (modal) modal.remove();
            
            // ETAPA 6: Travas de Segurança (Anti-Erro)
            console.error("Erro no processamento da compra:", error);
            
            if (error.message && error.message.includes("Limite excedido")) {
                alert(error.message);
                return;
            }

            alert("Erro crítico: " + error.message + "\nPor favor, entre em contato com o suporte.");
        }
    }

    window.copyPixFull = () => {
        const keyInput = document.getElementById('pixCopyKey');
        if (keyInput) {
            keyInput.select();
            document.execCommand('copy');
            // Professional notification
            const btn = document.querySelector('.pix-key-container button');
            const originalText = btn.textContent;
            btn.textContent = 'Copiado!';
            btn.style.background = 'var(--success)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }
    };

    // Legacy counter logic removed

    // Header Scroll Effect
    window.addEventListener('scroll', () => {
        const header = document.querySelector('.main-header');
        if (window.scrollY > 20) {
            header?.classList.add('scrolled');
        } else {
            header?.classList.remove('scrolled');
        }
    });
});
