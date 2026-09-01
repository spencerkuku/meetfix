import React from 'react';

export const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  const schoolName = import.meta.env.VITE_SCHOOL_NAME;

  return (
    <footer className="py-1 text-center text-[11px] text-slate-400">
      © {year} {schoolName ? `${schoolName} ` : ''}會議與報修系統 · Develop by{' '}
      <a
        href="https://spencerku.me"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-slate-500 hover:underline"
      >
        傅盛祥
      </a>
    </footer>
  );
};
