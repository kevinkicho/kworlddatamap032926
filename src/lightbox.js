import { S } from './state.js';

export function openLightbox(images, idx) {
  S.lightboxImages = images;
  S.lightboxIdx = idx;
  document.getElementById('wiki-lightbox').classList.add('open');
  renderLightboxFrame();
}

export function openCarouselLightbox() {
  openLightbox(window._lbImgs, S.carIdx);
}

export function closeLightbox() {
  document.getElementById('wiki-lightbox').classList.remove('open');
}

export function lightboxNav(dir) {
  S.lightboxIdx = (S.lightboxIdx + dir + S.lightboxImages.length) % S.lightboxImages.length;
  renderLightboxFrame();
}

export function renderLightboxFrame() {
  document.getElementById('lightbox-img').src = S.lightboxImages[S.lightboxIdx];
  document.getElementById('lightbox-counter').textContent =
    S.lightboxImages.length > 1 ? `${S.lightboxIdx + 1} / ${S.lightboxImages.length}` : '';
  document.getElementById('lightbox-prev').style.display = S.lightboxImages.length > 1 ? '' : 'none';
  document.getElementById('lightbox-next').style.display = S.lightboxImages.length > 1 ? '' : 'none';
}

export function carStart(images) {
  carStop();
  S.carImages = images;
  S.carIdx = 0;
  if (images.length > 1) S.carTimer = setInterval(() => carGo(1), 4500);
}

export function carStop() {
  clearInterval(S.carTimer);
  S.carTimer = null;
}

export function carResume() {
  if (S.carImages?.length > 1) {
    carStop();
    S.carTimer = setInterval(() => carGo(1), 4500);
  }
}

export function carGo(dir) {
  S.carIdx = (S.carIdx + dir + S.carImages.length) % S.carImages.length;
  carRender();
}

export function carJump(i) {
  S.carIdx = i;
  carRender();
  carStop();
  if (S.carImages.length > 1) S.carTimer = setInterval(() => carGo(1), 4500);
}

function carRender() {
  const img = document.getElementById('wiki-car-img');
  const counter = document.getElementById('wiki-car-counter');
  if (!img) return;
  img.classList.add('fade');
  setTimeout(() => {
    img.src = S.carImages[S.carIdx];
    img.classList.remove('fade');
  }, 180);
  if (counter) counter.textContent = `${S.carIdx + 1} / ${S.carImages.length}`;
  document.querySelectorAll('.wiki-car-dot').forEach((d, i) =>
    d.classList.toggle('active', i === S.carIdx));
}

export function initLightboxListeners() {
  document.getElementById('wiki-lightbox').addEventListener('click', function (e) {
    if (e.target === this) closeLightbox();
  });
  document.addEventListener('keydown', function (e) {
    const lb = document.getElementById('wiki-lightbox');
    if (!lb.classList.contains('open')) return;
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
    if (e.key === 'Escape') closeLightbox();
  });
}