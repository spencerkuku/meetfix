// Mirrors the masking rule in pages/Repairs.tsx (maskName): 陳小美 -> 陳O美,
// 王大明 -> 王O明, Jo -> Jo. Kept identical so a server-enforced mask and the
// frontend's own display-only mask never visibly disagree.
export function maskName(name: string): string {
  if (!name || name.length < 2) return name;
  if (name.length === 2) return name[0] + 'O';
  return name[0] + 'O' + name.slice(2);
}
