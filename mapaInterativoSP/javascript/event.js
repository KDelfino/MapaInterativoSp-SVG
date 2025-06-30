document.addEventListener('DOMContentLoaded', () => {
  fetch('dados/data.json')
    .then(response => response.json())
    .then(data => {
      const paths = document.querySelectorAll('path');
      const tooltip = document.getElementById('tooltip');
      const map = document.getElementById('map-container');
      const municipioNameDiv = document.getElementById('municipio-name');

      let isMouseInside = false;

      if (!paths.length) {
        console.error("Nenhum elemento 'path' encontrado.");
      }

      paths.forEach(path => {
        path.addEventListener('mouseenter', (e) => {
          const id = path.getAttribute('data-id');
          const info = data[id];

          tooltip.style.display = 'block';
          tooltip.innerHTML = `<strong>${info.title}</strong>`;
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
          const info = data[id];

          municipioNameDiv.innerHTML = `<h3>Município: ${info.title}</h3>`;
        
        });
      });

      map.addEventListener('mousemove', () => {
        if (!isMouseInside) {
          tooltip.style.display = 'none';
        }
      });
    })
    .catch(err => console.error('Erro ao carregar o arquivo JSON: ', err));
});
