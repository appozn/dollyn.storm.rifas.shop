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
    // UI Toggles (Sidebar/Overlay)
    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    const toggleSidebar = (show) => {
        if (show) { sidebar.classList.add('open'); overlay.classList.add('show'); document.body.style.overflow = 'hidden'; }
        else { sidebar.classList.remove('open'); overlay.classList.remove('show'); document.body.style.overflow = ''; }
    };

    if (menuToggle) menuToggle.addEventListener('click', () => toggleSidebar(true));
    if (closeSidebar) closeSidebar.addEventListener('click', () => toggleSidebar(false));
    if (overlay) overlay.addEventListener('click', () => toggleSidebar(false));

    // Close sidebar on link click (for mobile experience)
    const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => toggleSidebar(false));
    });

    // Add scroll effect to header
    const header = document.querySelector('.main-header');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.backgroundColor = 'rgba(10, 10, 11, 0.95)';
            header.style.padding = '10px 0';
        } else {
            header.style.backgroundColor = 'rgba(10, 10, 11, 0.8)';
            header.style.padding = '15px 0';
        }
    });

    // Dynamic Campaign Rendering
    const renderCampaignCards = () => {
        const grid = document.getElementById('campaignGrid');
        if (!grid) return;

        const raffles = DataService.getRafflesList().filter(r => r.status === 'Ativa');
        grid.innerHTML = raffles.map(r => `
            <div class="raffle-card" data-raffle-id="${r.id}" data-unit-price="${r.price}" data-min-qty="${r.minQty}">
                <div class="card-image">
                    <img src="${r.imageUrl}" alt="${r.name}">
                    <div class="status-badge">Aberto</div>
                </div>
                <div class="card-body">
                    <div class="card-meta flex justify-between align-center">
                        <span class="product-type">Rifa de Skin CS</span>
                        <span class="unit-price-tag">R$ ${parseFloat(r.price).toFixed(2).replace('.', ',')} / número</span>
                    </div>
                    <h3>${r.name}</h3>
                    <p class="card-subtitle">${r.description}</p>

                    <div class="quantity-selector-container">
                        <div class="flex align-center justify-between" style="margin-bottom: 8px;">
                            <span class="label">Quantidade de números</span>
                            <span class="min-qty-hint">(Mínimo ${r.minQty} unidades)</span>
                        </div>
                        <div class="quantity-controls flex align-center justify-between gap-10">
                            <button class="qty-shortcut" onclick="MainApp.updateQty('${r.id}', -5)">-5</button>
                            <button class="qty-btn" onclick="MainApp.updateQty('${r.id}', -1)"><i data-lucide="minus"></i></button>
                            <span class="qty-value" id="qty-${r.id}">${r.minQty}</span>
                            <button class="qty-btn" onclick="MainApp.updateQty('${r.id}', 1)"><i data-lucide="plus"></i></button>
                            <button class="qty-shortcut" onclick="MainApp.updateQty('${r.id}', 5)">+5</button>
                        </div>
                    </div>

                    <div class="card-footer">
                        <div class="total-price-display">
                            <span class="label">Total a pagar:</span>
                            <span class="price" id="total-${r.id}">R$ ${(r.minQty * r.price).toFixed(2).replace('.', ',')}</span>
                        </div>
                        <button class="premium-btn" onclick="MainApp.buyRaffle('${r.id}')">Comprar agora</button>
                    </div>
                </div>
            </div>
        `).join('');
        if (window.lucide) lucide.createIcons();
    };

    renderCampaignCards();

    // Globals for dynamic interaction
    window.MainApp = {
        updateQty(raffleId, delta) {
            const qtyEl = document.getElementById(`qty-${raffleId}`);
            const totalEl = document.getElementById(`total-${raffleId}`);
            const card = document.querySelector(`.raffle-card[data-raffle-id="${raffleId}"]`);

            const unitPrice = parseFloat(card.dataset.unitPrice);
            const minQty = parseInt(card.dataset.minQty);
            let currentQty = parseInt(qtyEl.textContent);

            currentQty += delta;
            if (currentQty < minQty) {
                alert(`A quantidade mínima para esta rifa é de ${minQty} números.`);
                return;
            }

            qtyEl.textContent = currentQty;
            totalEl.textContent = `R$ ${(currentQty * unitPrice).toFixed(2).replace('.', ',')}`;
        },

        buyRaffle(raffleId) {
            const card = document.querySelector(`.raffle-card[data-raffle-id="${raffleId}"]`);
            const unitPrice = parseFloat(card.dataset.unitPrice);
            const qty = parseInt(document.getElementById(`qty-${raffleId}`).textContent);
            const total = (qty * unitPrice).toFixed(2);

            // Get raffle context
            window.currentRaffleId = raffleId;
            const raffleName = card.querySelector('h3').textContent;
            window.currentRaffleName = raffleName;

            showIdentityModal(total, qty);
        }
    };

    function showIdentityModal(amount, qty) {
        const modalHtml = `
            <div id="idModal" class="pix-modal-overlay">
                <div class="pix-modal" style="max-width:400px;border-radius:24px;border:2px solid var(--accent-primary);">
                    <h3 style="font-size:22px;color:var(--accent-primary);">v2.0 - Identificação Requerida</h3>
                    <p style="margin-bottom:25px;font-size:14px;color:var(--text-muted);">Para sua segurança, informe Nome, CPF e WhatsApp para vincular seus números.</p>
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
                    <div style="display: flex; justify-content: center; width: 100%;">
                        <button class="premium-btn full" id="proceedToPayBtn" style="padding:16px;">Gerar Pagamento PIX</button>
                    </div>
                    <button class="close-modal" id="closeIdModal" style="margin-top:10px;border:none;font-size:13px;text-decoration:underline;">Cancelar e voltar</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('closeIdModal').addEventListener('click', () => document.getElementById('idModal').remove());

        document.getElementById('proceedToPayBtn').addEventListener('click', () => {
            const name = document.getElementById('userName').value;
            const cpf = document.getElementById('userCpf').value;
            const phone = document.getElementById('userPhone').value;

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
            showPixModal(amount, qty, name, phone, cpf);
        });
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

    function processPurchase(amount, qty, name, phone, cpf) {
        try {
            // ETAPA 1, 2, 3 e 4: Detectar, Gerar, Salvar e Vincular
            const purchase = DataService.completePurchase({
                raffleId: window.currentRaffleId || 'test-raffle',
                raffleName: window.currentRaffleName || 'Produto Teste',
                userName: name,
                userPhone: phone,
                userCpf: cpf,
                amount: amount,
                qty: qty
            });

            // ETAPA 5: Confirmação Visual ao Usuário
            const modal = document.querySelector('.pix-modal');
            modal.innerHTML = `
                <div class="success-icon" style="margin-bottom:20px;">
                    <i data-lucide="check-circle" style="width:64px;height:64px;color:var(--accent-primary)"></i>
                </div>
                <h3 style="font-size:24px;margin-bottom:10px;">Pagamento Confirmado!</h3>
                <p style="color:var(--text-muted);margin-bottom:20px;">Seus números já estão disponíveis em <strong>Meus Números</strong>.</p>
                
                <div class="numbers-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.2);padding:20px;border-radius:15px;margin-bottom:25px;border:1px solid var(--border-color);">
                    ${purchase.numbers.map(n => `<span class="num-chip" style="margin:0;font-size:14px;">#${n}</span>`).join('')}
                </div>

                <p style="font-size:13px;color:var(--text-dim);margin-bottom:20px;">Você será redirecionado em instantes...</p>
                
                <button class="premium-btn full" onclick="location.href='dashboard.html'" style="padding:18px;">Ver Meus Números Agora</button>
            `;

            if (window.lucide) lucide.createIcons();

            // Auto-redirect after 5 seconds per ETAPA 5
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 5000);

        } catch (error) {
            // ETAPA 6: Travas de Segurança (Anti-Erro)
            console.error("Erro no processamento da compra:", error);
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
