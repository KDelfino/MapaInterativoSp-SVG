/**
 * Mapa Interativo do Estado de São Paulo
 * Lógica de navegação, zoom/pan via viewBox, busca inteligente e visualização temática
 */

document.addEventListener('DOMContentLoaded', () => {
  fetch('dados/data.json')
    .then(response => response.json())
    .then(data => {
      // Elementos do DOM
      const svg = document.querySelector('#map-container svg');
      const mapContainer = document.getElementById('map-container');
      const tooltip = document.getElementById('tooltip');
      const sidebarContent = document.getElementById('sidebar-content');
      const searchInput = document.getElementById('search-input');
      const autocompleteList = document.getElementById('autocomplete-list');
      const searchClearBtn = document.getElementById('search-clear');
      const toast = document.getElementById('toast');
      const mapLegend = document.getElementById('map-legend');

      // Botões de Zoom
      const btnZoomIn = document.getElementById('btn-zoom-in');
      const btnZoomOut = document.getElementById('btn-zoom-out');
      const btnZoomReset = document.getElementById('btn-zoom-reset');

      // Botões de Camadas
      const btnModeNeutral = document.getElementById('btn-mode-neutral');
      const btnModeChoro = document.getElementById('btn-mode-choro');

      // Paths do Mapa
      const paths = document.querySelectorAll('path[data-id]');

      if (!paths.length) {
        console.error("Nenhum elemento 'path[data-id]' encontrado.");
        return;
      }

      // -----------------------------------------------------------------------
      // Processamento e Indexação dos Dados
      // -----------------------------------------------------------------------
      const normalizeText = (text) => {
        if (!text) return "";
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      };

      // Array ordenado por população para calcular rankings
      const sortedMunicipalities = Object.entries(data)
        .map(([id, info]) => ({
          id: id,
          title: info.title || "",
          populacao: typeof info.populacao === 'number' ? info.populacao : 0,
          normalizedTitle: normalizeText(info.title || "")
        }))
        .sort((a, b) => b.populacao - a.populacao);

      const totalStatePopulation = sortedMunicipalities.reduce((acc, cur) => acc + cur.populacao, 0);

      // Mapa enriquecido com ranking e percentual
      const enrichedData = {};
      sortedMunicipalities.forEach((m, index) => {
        const rank = index + 1;
        const percent = totalStatePopulation > 0 ? (m.populacao / totalStatePopulation) * 100 : 0;
        
        // Atribuição de faixas (tiers) para mapa coroplético
        let tier = 1;
        if (m.populacao >= 500000) tier = 5;
        else if (m.populacao >= 100000) tier = 4;
        else if (m.populacao >= 50000) tier = 3;
        else if (m.populacao >= 10000) tier = 2;
        else tier = 1;

        enrichedData[m.id] = {
          ...m,
          rank: rank,
          percent: percent,
          tier: tier
        };
      });

      // Aplica tiers aos paths no SVG
      paths.forEach(path => {
        path.classList.add('map-region');
        const id = path.getAttribute('data-id');
        const info = enrichedData[id];
        if (info) {
          path.setAttribute('data-tier', info.tier);
        }
      });

      let highlightedPaths = null;
      let activeMunicipalityId = null;

      // -----------------------------------------------------------------------
      // Sistema de Zoom e Pan via ViewBox
      // -----------------------------------------------------------------------
      const originalViewBox = { x: 0, y: 0, w: 1074, h: 720 };
      let viewBox = { ...originalViewBox };

      function setViewBox(x, y, w, h) {
        viewBox.x = x;
        viewBox.y = y;
        viewBox.w = Math.max(80, Math.min(originalViewBox.w * 1.5, w));
        viewBox.h = Math.max(53, Math.min(originalViewBox.h * 1.5, h));
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
      }

      function zoom(factor, clientX, clientY) {
        const rect = svg.getBoundingClientRect();
        const cursorX = clientX !== undefined ? clientX - rect.left : rect.width / 2;
        const cursorY = clientY !== undefined ? clientY - rect.top : rect.height / 2;

        const svgX = viewBox.x + (cursorX / rect.width) * viewBox.w;
        const svgY = viewBox.y + (cursorY / rect.height) * viewBox.h;

        const newW = viewBox.w * factor;
        const newH = viewBox.h * factor;

        // Limites de zoom
        if (newW < 70 || newW > originalViewBox.w * 1.8) return;

        const newX = svgX - (cursorX / rect.width) * newW;
        const newY = svgY - (cursorY / rect.height) * newH;

        setViewBox(newX, newY, newW, newH);
      }

      function resetZoom() {
        animateViewBox(originalViewBox.x, originalViewBox.y, originalViewBox.w, originalViewBox.h, 350);
      }

      // Animação suave de transição de viewBox
      let animationFrame = null;
      function animateViewBox(targetX, targetY, targetW, targetH, duration = 300) {
        if (animationFrame) cancelAnimationFrame(animationFrame);
        const startX = viewBox.x;
        const startY = viewBox.y;
        const startW = viewBox.w;
        const startH = viewBox.h;
        const startTime = performance.now();

        function step(now) {
          const progress = Math.min((now - startTime) / duration, 1);
          const ease = 0.5 - Math.cos(progress * Math.PI) / 2; // easeInOut

          const currentX = startX + (targetX - startX) * ease;
          const currentY = startY + (targetY - startY) * ease;
          const currentW = startW + (targetW - startW) * ease;
          const currentH = startH + (targetH - startH) * ease;

          setViewBox(currentX, currentY, currentW, currentH);

          if (progress < 1) {
            animationFrame = requestAnimationFrame(step);
          } else {
            animationFrame = null;
          }
        }
        animationFrame = requestAnimationFrame(step);
      }

      function zoomToMunicipality(pathElement) {
        if (!pathElement) return;
        try {
          const bbox = pathElement.getBBox();
          const padding = 120;
          const targetW = Math.max(bbox.width + padding * 2, 260);
          const targetH = targetW * (720 / 1074);
          const targetX = bbox.x + bbox.width / 2 - targetW / 2;
          const targetY = bbox.y + bbox.height / 2 - targetH / 2;

          animateViewBox(targetX, targetY, targetW, targetH, 400);
        } catch (e) {
          console.warn("Não foi possível calcular bbox para o elemento:", e);
        }
      }

      // Eventos de Mouse/Touch para Pan
      let isPanning = false;
      let startPoint = { x: 0, y: 0 };

      mapContainer.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // apenas botão esquerdo
        isPanning = true;
        startPoint = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const dx = (e.clientX - startPoint.x) * (viewBox.w / svg.clientWidth);
        const dy = (e.clientY - startPoint.y) * (viewBox.h / svg.clientHeight);

        setViewBox(viewBox.x - dx, viewBox.y - dy, viewBox.w, viewBox.h);
        startPoint = { x: e.clientX, y: e.clientY };
      });

      window.addEventListener('mouseup', () => {
        isPanning = false;
      });

      mapContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 0.85 : 1.15;
        zoom(factor, e.clientX, e.clientY);
      }, { passive: false });

      // Botões de Controle de Zoom
      if (btnZoomIn) btnZoomIn.addEventListener('click', () => zoom(0.75));
      if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoom(1.3));
      if (btnZoomReset) btnZoomReset.addEventListener('click', resetZoom);

      // -----------------------------------------------------------------------
      // Modos de Visualização (Neutro vs População)
      // -----------------------------------------------------------------------
      function setMode(mode) {
        if (mode === 'choropleth') {
          mapContainer.classList.add('choropleth-mode');
          btnModeChoro.classList.add('active');
          btnModeNeutral.classList.remove('active');
          if (mapLegend) mapLegend.classList.add('visible');
        } else {
          mapContainer.classList.remove('choropleth-mode');
          btnModeNeutral.classList.add('active');
          btnModeChoro.classList.remove('active');
          if (mapLegend) mapLegend.classList.remove('visible');
        }
      }

      if (btnModeNeutral) btnModeNeutral.addEventListener('click', () => setMode('neutral'));
      if (btnModeChoro) btnModeChoro.addEventListener('click', () => setMode('choropleth'));

      // -----------------------------------------------------------------------
      // Painel Lateral (Estado Vazio vs Município Selecionado)
      // -----------------------------------------------------------------------
      function renderEmptyState() {
        activeMunicipalityId = null;
        if (highlightedPaths) {
          highlightedPaths.forEach(p => p.classList.remove('highlight'));
          highlightedPaths = null;
        }

        const topCities = sortedMunicipalities.slice(0, 6);

        sidebarContent.innerHTML = `
          <div class="empty-state">
            <div class="sp-overview-card">
              <h2>
                <i data-lucide="map-pinned"></i>
                Panorama do Estado
              </h2>
              <div class="sp-overview-grid">
                <div class="sp-stat-box">
                  <div class="sp-stat-label">População Total</div>
                  <div class="sp-stat-value">${totalStatePopulation.toLocaleString('pt-BR')}</div>
                </div>
                <div class="sp-stat-box">
                  <div class="sp-stat-label">Municípios</div>
                  <div class="sp-stat-value">645</div>
                </div>
              </div>
            </div>

            <div class="quick-rankings">
              <h3>
                <i data-lucide="trophy"></i>
                Maiores Municípios
              </h3>
              <div class="quick-list">
                ${topCities.map((c, i) => `
                  <div class="quick-item" data-id="${c.id}">
                    <div class="quick-item-info">
                      <span class="quick-rank-badge">${i + 1}º</span>
                      <span class="quick-name">${c.title}</span>
                    </div>
                    <span class="quick-pop">${c.populacao.toLocaleString('pt-BR')} hab</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;

        // Adiciona listeners para os itens rápidos
        sidebarContent.querySelectorAll('.quick-item').forEach(item => {
          item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            selectMunicipality(id, true);
          });
        });

        // Remove hash da url sem reload
        if (window.location.hash) {
          history.pushState(null, null, ' ');
        }

        if (window.lucide) window.lucide.createIcons();
      }

      function getPorte(pop) {
        if (pop >= 500000) return 'Grande Porte';
        if (pop >= 100000) return 'Médio-Grande Porte';
        if (pop >= 50000) return 'Médio Porte';
        if (pop >= 20000) return 'Pequeno Porte II';
        return 'Pequeno Porte I';
      }

      function selectMunicipality(municipalityId, shouldZoom = false) {
        const info = enrichedData[municipalityId];
        if (!info) return;

        activeMunicipalityId = municipalityId;

        // Atualiza destaque no mapa SVG
        if (highlightedPaths) {
          highlightedPaths.forEach(p => p.classList.remove('highlight'));
        }

        const newPaths = document.querySelectorAll(`path[data-id="${municipalityId}"]`);
        newPaths.forEach(p => p.classList.add('highlight'));
        highlightedPaths = newPaths;

        if (shouldZoom && newPaths.length > 0) {
          zoomToMunicipality(newPaths[0]);
        }

        // Formata link oficial do IBGE Cidades
        const ibgeSlug = normalizeText(info.title).replace(/\s+/g, '-');
        const ibgeUrl = `https://cidades.ibge.gov.br/brasil/sp/${ibgeSlug}/panorama`;

        // Renderiza card do município selecionado
        sidebarContent.innerHTML = `
          <div class="municipio-card">
            <div class="municipio-header">
              <div class="municipio-title-group">
                <h2>${info.title}</h2>
                <div class="municipio-badge-row" style="margin-top: 6px;">
                  <span class="badge badge-rank">
                    <i data-lucide="award"></i>
                    ${info.rank}º mais populoso
                  </span>
                  <span class="badge badge-tier">
                    ${getPorte(info.populacao)}
                  </span>
                </div>
              </div>
              <button class="btn-close-card" id="btn-close-selection" title="Voltar ao início">
                <i data-lucide="x"></i>
              </button>
            </div>

            <div class="stats-container">
              <div class="stat-card">
                <div class="stat-icon">
                  <i data-lucide="users"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-title">População Estimada</div>
                  <div class="stat-value">${info.populacao.toLocaleString('pt-BR')} <span style="font-size: 13px; font-weight: 500; color: var(--text-muted);">hab</span></div>
                </div>
              </div>

              <div class="stat-card">
                <div class="stat-icon">
                  <i data-lucide="pie-chart"></i>
                </div>
                <div class="stat-content">
                  <div class="stat-title">Participação no Estado</div>
                  <div class="stat-value">${info.percent.toFixed(2)}%</div>
                  <div class="stat-bar-wrapper">
                    <div class="stat-bar-fill" style="width: ${Math.min(info.percent * 3.5, 100)}%;"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="actions-container">
              <a href="${ibgeUrl}" target="_blank" rel="noopener noreferrer" class="btn-action btn-primary-action">
                <i data-lucide="external-link"></i>
                Panorama Completo no IBGE
              </a>

              <div style="display: flex; gap: 8px;">
                <button class="btn-action btn-secondary-action" id="btn-focus-map" style="flex: 1;">
                  <i data-lucide="crosshair"></i>
                  Focar no Mapa
                </button>
                <button class="btn-action btn-secondary-action" id="btn-copy-link" style="flex: 1;">
                  <i data-lucide="share-2"></i>
                  Compartilhar
                </button>
              </div>
            </div>
          </div>
        `;

        // Botão Fechar Seleção
        const btnClose = document.getElementById('btn-close-selection');
        if (btnClose) {
          btnClose.addEventListener('click', renderEmptyState);
        }

        // Botão Focar no Mapa
        const btnFocus = document.getElementById('btn-focus-map');
        if (btnFocus) {
          btnFocus.addEventListener('click', () => {
            if (newPaths.length > 0) zoomToMunicipality(newPaths[0]);
          });
        }

        // Botão Copiar Link com Toast
        const btnCopy = document.getElementById('btn-copy-link');
        if (btnCopy) {
          btnCopy.addEventListener('click', () => {
            const url = `${window.location.origin}${window.location.pathname}#${encodeURIComponent(info.title)}`;
            navigator.clipboard.writeText(url).then(() => {
              showToast("Link do município copiado com sucesso!");
            }).catch(() => {
              showToast("Não foi possível copiar o link.");
            });
          });
        }

        // Atualiza URL hash
        window.location.hash = encodeURIComponent(info.title);

        if (window.lucide) window.lucide.createIcons();
      }

      function showToast(message) {
        if (!toast) return;
        toast.innerHTML = `<i data-lucide="check-circle-2"></i> <span>${message}</span>`;
        if (window.lucide) window.lucide.createIcons();
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }

      // -----------------------------------------------------------------------
      // Eventos nos Paths (Hover e Click)
      // -----------------------------------------------------------------------
      paths.forEach(path => {
        path.addEventListener('mouseenter', (e) => {
          const id = path.getAttribute('data-id');
          const info = enrichedData[id];
          if (!info) return;

          tooltip.innerHTML = `
            <div class="tooltip-title">${info.title}</div>
            <div class="tooltip-meta">
              <i data-lucide="users" style="width: 12px; height: 12px;"></i>
              ${info.populacao.toLocaleString('pt-BR')} hab (${info.rank}º)
            </div>
          `;
          if (window.lucide) window.lucide.createIcons();

          tooltip.style.display = 'block';
          updateTooltipPosition(e);
        });

        path.addEventListener('mousemove', (e) => {
          updateTooltipPosition(e);
        });

        path.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none';
        });

        path.addEventListener('click', () => {
          const id = path.getAttribute('data-id');
          selectMunicipality(id, false);
        });
      });

      function updateTooltipPosition(e) {
        const offsetX = 16;
        const tooltipWidth = tooltip.offsetWidth || 150;
        const tooltipHeight = tooltip.offsetHeight || 44;

        // Posiciona ligeiramente acima e à direita do cursor
        let x = e.clientX + offsetX;
        let y = e.clientY - tooltipHeight - 12;

        // Se passar do topo da tela, posiciona abaixo do cursor
        if (y < 12) {
          y = e.clientY + 20;
        }

        // Se passar da lateral direita da tela, inverte para a esquerda do cursor
        if (x + tooltipWidth > window.innerWidth - 12) {
          x = e.clientX - tooltipWidth - offsetX;
        }

        // Garante que não saia pela borda esquerda
        if (x < 12) {
          x = 12;
        }

        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
      }

      // -----------------------------------------------------------------------
      // Autocomplete & Busca Inteligente
      // -----------------------------------------------------------------------
      let activeItemIndex = -1;

      searchInput.addEventListener('input', function() {
        const val = this.value;
        activeItemIndex = -1;

        if (searchClearBtn) {
          searchClearBtn.classList.toggle('visible', val.length > 0);
        }

        if (!val.trim()) {
          closeAutocomplete();
          return;
        }

        const query = normalizeText(val);
        const matches = sortedMunicipalities.filter(m => m.normalizedTitle.includes(query)).slice(0, 10);

        if (!matches.length) {
          autocompleteList.innerHTML = `<div class="autocomplete-empty">Nenhum município encontrado para "${val}"</div>`;
          autocompleteList.classList.add('open');
          return;
        }

        autocompleteList.innerHTML = matches.map((m, index) => {
          // Destaca o trecho correspondente no nome
          const title = m.title;
          const matchStart = normalizeText(title).indexOf(query);
          let highlightedTitle = title;
          if (matchStart !== -1) {
            const before = title.substring(0, matchStart);
            const match = title.substring(matchStart, matchStart + query.length);
            const after = title.substring(matchStart + query.length);
            highlightedTitle = `${before}<mark>${match}</mark>${after}`;
          }

          return `
            <div class="autocomplete-item" data-id="${m.id}" data-index="${index}">
              <span class="autocomplete-title">${highlightedTitle}</span>
              <span class="autocomplete-meta">${m.populacao.toLocaleString('pt-BR')} hab</span>
            </div>
          `;
        }).join('');

        autocompleteList.classList.add('open');

        autocompleteList.querySelectorAll('.autocomplete-item').forEach(item => {
          item.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            const info = enrichedData[id];
            searchInput.value = info ? info.title : '';
            closeAutocomplete();
            selectMunicipality(id, true);
          });
        });
      });

      // Navegação por teclado no Autocomplete
      searchInput.addEventListener('keydown', function(e) {
        const items = autocompleteList.querySelectorAll('.autocomplete-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          activeItemIndex = (activeItemIndex + 1) % items.length;
          updateActiveItem(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          activeItemIndex = (activeItemIndex - 1 + items.length) % items.length;
          updateActiveItem(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeItemIndex > -1 && items[activeItemIndex]) {
            items[activeItemIndex].click();
          } else if (items.length > 0) {
            items[0].click();
          }
        } else if (e.key === 'Escape') {
          closeAutocomplete();
        }
      });

      function updateActiveItem(items) {
        items.forEach((item, index) => {
          item.classList.toggle('active', index === activeItemIndex);
          if (index === activeItemIndex) item.scrollIntoView({ block: 'nearest' });
        });
      }

      function closeAutocomplete() {
        autocompleteList.innerHTML = '';
        autocompleteList.classList.remove('open');
        activeItemIndex = -1;
      }

      if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
          searchInput.value = '';
          searchClearBtn.classList.remove('visible');
          closeAutocomplete();
          searchInput.focus();
        });
      }

      // Atalho de teclado '/' para focar na busca
      window.addEventListener('keydown', (e) => {
        if (e.key === '/' && document.activeElement !== searchInput) {
          e.preventDefault();
          searchInput.focus();
          searchInput.select();
        }
      });

      document.addEventListener('click', (e) => {
        if (!e.target.closest('#search-wrapper')) {
          closeAutocomplete();
        }
      });

      // -----------------------------------------------------------------------
      // Deep Linking Inicial (Via Hash na URL)
      // -----------------------------------------------------------------------
      function checkInitialHash() {
        const hash = window.location.hash.replace('#', '').trim();
        if (hash) {
          const decoded = decodeURIComponent(hash);
          const found = sortedMunicipalities.find(m => 
            normalizeText(m.title) === normalizeText(decoded) || m.id === decoded
          );
          if (found) {
            selectMunicipality(found.id, true);
            return;
          }
        }
        renderEmptyState();
      }

      // Inicia a aplicação
      checkInitialHash();
      if (window.lucide) window.lucide.createIcons();
    })
    .catch(err => {
      console.error('Erro ao carregar dados do mapa:', err);
    });
});
