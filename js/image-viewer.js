// ==========================================================
// image-viewer.js — Hover scale-in-place zoom + Fullscreen lightbox
// ==========================================================

export function initImageViewer(containerSelector) {
  const galleryMain = document.querySelector(containerSelector || '.gallery__main');
  if (!galleryMain) return;

  const img = galleryMain.querySelector('img');
  if (!img) return;

  // === HOVER ZOOM: phóng đại tại chỗ theo vị trí chuột ===
  const hasHover = window.matchMedia('(hover: hover)').matches;
  if (hasHover) {
    img.addEventListener('mousemove', (e) => {
      const rect = img.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      img.style.transformOrigin = `${x}% ${y}%`;
      img.style.transform = 'scale(2.2)';
    });

    img.addEventListener('mouseleave', () => {
      img.style.transform = 'scale(1)';
      img.style.transformOrigin = 'center center';
    });
  }

  // === LIGHTBOX: click mở fullscreen ===
  const zoomBtn = galleryMain.querySelector('.gallery__zoom-hint');

  function openLightbox() {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `
      <div class="lightbox__backdrop"></div>
      <div class="lightbox__content">
        <img src="${img.src}" alt="${img.alt}">
        <button class="lightbox__close" type="button" aria-label="Đóng">&times;</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));

    const close = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => overlay.remove(), 300);
      document.removeEventListener('keydown', escHandler);
    };
    function escHandler(e) {
      if (e.key === 'Escape') close();
    }
    overlay.querySelector('.lightbox__backdrop').addEventListener('click', close);
    overlay.querySelector('.lightbox__close').addEventListener('click', close);
    document.addEventListener('keydown', escHandler);
  }

  galleryMain.addEventListener('click', (e) => {
    if (e.target.closest('.specimen-tag')) return;
    openLightbox();
  });
  if (zoomBtn) {
    zoomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLightbox();
    });
  }
}
