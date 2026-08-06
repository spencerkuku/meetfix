import React from 'react';

export const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="py-4 text-center text-xs text-slate-400 space-y-0.5">
      <p>© {year} 嘉義高工 會議與報修系統</p>
      <p>
        Develop by{' '}
        <a
          href="#"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-500 hover:underline"
        >
          XXX
        </a>{' '}
        畢業學長
      </p>
    </footer>
  );
};
