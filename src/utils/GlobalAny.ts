export const GlobalAny: any = (() => {
  if (!(document as any).globalAny) {
    (document as any).globalAny = {};
  }
  return (document as any).globalAny;
})();
