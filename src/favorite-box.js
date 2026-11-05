// The small box for naming a favorite and choosing its folder. It's a real dialog so it also
// works on top of Add stream. Nothing is saved until Save.

import { el, openDialog } from './ui.js';

const PHONE = '(max-width: 640px)';

function place(box, anchor) {
  const margin = 8;
  const { width, height } = box.getBoundingClientRect();
  const left = (window.innerWidth - width) / 2;
  // On a phone the keyboard takes the bottom half, so the box always sits at the top.
  if (!anchor || window.matchMedia(PHONE).matches) {
    box.style.left = `${left}px`;
    box.style.top = '52px';
    return;
  }
  const spot = anchor.getBoundingClientRect();
  const below = spot.bottom + 6;
  const top = below + height + margin > window.innerHeight ? spot.top - height - 6 : below;
  box.style.left = `${Math.max(margin, Math.min(spot.left, window.innerWidth - width - margin))}px`;
  box.style.top = `${Math.max(margin, top)}px`;
}

export function openFavoriteBox({ anchor, title, name, folder, folders, removable, onSave, onRemove }) {
  const box = document.getElementById('favorite-box');
  if (box.open) return;

  const nameInput = el('input', { type: 'text', value: name, maxLength: 80, autocomplete: 'off' });
  const folderInput = el('input', { type: 'text', value: folder, maxLength: 40, autocomplete: 'off', placeholder: 'No folder' });
  const save = el('button', { type: 'submit', class: 'add-button', textContent: 'Save' });

  const chips = folders.map((existing) => el('button', {
    type: 'button',
    class: 'folder-chip',
    textContent: existing,
    title: existing,
    on: {
      click() {
        const chosen = folderInput.value.trim().toLocaleLowerCase() === existing.toLocaleLowerCase();
        folderInput.value = chosen ? '' : existing;
        syncChips();
      },
    },
  }));
  const syncChips = () => {
    const typed = folderInput.value.trim().toLocaleLowerCase();
    chips.forEach((chip, index) => chip.setAttribute('aria-pressed', String(folders[index].toLocaleLowerCase() === typed)));
  };
  syncChips();
  folderInput.addEventListener('input', syncChips);
  nameInput.addEventListener('input', () => {
    save.disabled = !nameInput.value.trim();
  });

  const remove = removable ? el('button', {
    type: 'button',
    class: 'plain-button favorite-remove',
    textContent: 'Remove',
    on: {
      click() {
        if (!remove.classList.contains('is-confirming')) {
          remove.classList.add('is-confirming');
          remove.textContent = 'Confirm remove';
          return;
        }
        box.close();
        onRemove();
      },
    },
  }) : null;

  box.replaceChildren(el('form', {
    on: {
      submit(event) {
        event.preventDefault();
        const finalName = nameInput.value.trim();
        if (!finalName) return;
        box.close();
        onSave(finalName, folderInput.value.trim());
      },
    },
  },
  el('h2', { textContent: title }),
  el('label', {}, 'Name', nameInput),
  el('label', {}, 'Folder', folderInput),
  chips.length ? el('div', { class: 'folder-chips' }, ...chips) : null,
  el('div', { class: 'dialog-actions' },
    remove,
    el('button', { type: 'button', class: 'plain-button', textContent: 'Cancel', on: { click: () => box.close() } }),
    save)));

  openDialog(box);
  place(box, anchor);
  nameInput.select();
}

// The box has no padding of its own, so a click landing on the dialog itself is outside it.
document.getElementById('favorite-box').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
