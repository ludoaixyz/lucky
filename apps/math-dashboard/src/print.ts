export function setPrintLayout(active: boolean, body: HTMLElement = document.body): void {
  body.classList.toggle('print-layout', active);
}

export function bindPrintLayout(): () => void {
  const before = (): void => setPrintLayout(true);
  const after = (): void => setPrintLayout(false);
  window.addEventListener('beforeprint', before);
  window.addEventListener('afterprint', after);
  return () => {
    window.removeEventListener('beforeprint', before);
    window.removeEventListener('afterprint', after);
  };
}
