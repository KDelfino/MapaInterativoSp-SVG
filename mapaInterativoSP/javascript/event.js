document.addEventListener('DOMContentLoaded', () => {

  fetch('dados/data.json')
    .then(response => response.json())
    .then(data => {
      const paths = document.querySelectorAll('path');
      const tooltip = document.getElementById('tooltip');
      const map = document.getElementById('map-container');
      const municipioNameDiv = document.getElementById('municipio-name');
      const searchInput = document.getElementById('search-input');
      const autocompleteList = document.getElementById('autocomplete-list');

      let highlightedPaths = null;

      const municipalities = Object.entries(data).map(([id, info]) => ({
        id: id,
        title: info.title
      }));

      const normalizeText = (text) => {
        if (!text) return "";
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      }
      
      let isMouseInside = false;

      if (!paths.length) {
        console.error("Nenhum elemento 'path' encontrado.");
      }

      function selectMunicipality(municipalityId) {
        const info = data[municipalityId];
        if (!info) return; 

        
        if (highlightedPaths) {
          highlightedPaths.forEach(p => p.classList.remove('highlight'));
        }

        
        const newPathsToHighlight = document.querySelectorAll(`path[data-id="${municipalityId}"]`);

      
        newPathsToHighlight.forEach(p => p.classList.add('highlight'));

       
        highlightedPaths = newPathsToHighlight;

        municipioNameDiv.innerHTML = `<h3>Município: ${info.title}</h3>`;
      }

      paths.forEach(path => {
        path.classList.add('map-region');

        path.addEventListener('mouseenter', (e) => {
          const id = path.getAttribute('data-id');
          const info = data[id];

          tooltip.style.display = 'block';
          if (info && info.title) {
            tooltip.innerHTML = `<strong>${info.title}</strong>`;
          } else {
            tooltip.style.display = 'none';
          }
          tooltip.style.left = e.pageX + 10 + 'px';
          tooltip.style.top = e.pageY + 10 + 'px';

          isMouseInside = true;
        });

        path.addEventListener('mousemove', (e) => {
          tooltip.style.left = e.pageX + 10 + 'px';
          tooltip.style.top = e.pageY + 10 + 'px';
        });

        path.addEventListener('mouseleave', () => {
          isMouseInside = false;

          setTimeout(() => {
            if (!isMouseInside) {
              tooltip.style.display = 'none';
            }
          }, 50);
        });



        path.addEventListener('click', (e) => {
          const id = path.getAttribute('data-id');
          selectMunicipality(id);
        });
      });

      map.addEventListener('mousemove', () => {
        if (!isMouseInside) {
          tooltip.style.display = 'none';
        }
      });

      // --- Lógica do Autocomplete ---
      searchInput.addEventListener("input", function (e) {
        const inputValue = this.value;
        closeAllLists();
        if (!inputValue) { return false; }

        const suggestions = municipalities.filter(m =>
          normalizeText(m.title).startsWith(normalizeText(inputValue))
        );

        suggestions.forEach(municipality => {
          const suggestionDiv = document.createElement("DIV");
          suggestionDiv.innerHTML = `<strong>${municipality.title.substr(0, inputValue.length)}</strong>`;
          suggestionDiv.innerHTML += municipality.title.substr(inputValue.length);
          
          suggestionDiv.addEventListener("click", function (e) {
            searchInput.value = municipality.title;
            closeAllLists();

            selectMunicipality(municipality.id);

            const pathsToScroll = document.querySelectorAll(`path[data-id="${municipality.id}"]`);
            if (pathsToScroll.length > 0) {
              pathsToScroll[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            }
          });
          autocompleteList.appendChild(suggestionDiv);
        });
      });

      function closeAllLists(elmnt) {
        const items = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < items.length; i++) {
          if (elmnt != items[i] && elmnt != searchInput) {
            items[i].innerHTML = "";
          }
        }
      }

      document.addEventListener("click", function (e) {
        closeAllLists(e.target);
      });

    })
    .catch(err => console.error('Erro ao carregar o arquivo JSON: ', err));
});
