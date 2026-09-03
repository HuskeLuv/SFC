'use client';

import { useState } from 'react';
import LandingLogo from './LandingLogo';

const LINKS = [
  { href: '#funcionalidades', label: 'Funcionalidades' },
  { href: '#analises', label: 'Análises' },
  { href: '#educacao', label: 'Educação' },
  { href: '#planos', label: 'Planos' },
  { href: '#faq', label: 'Dúvidas' },
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header>
      <div className="wrap nav">
        <a className="logo" href="#" aria-label="My Finance">
          <LandingLogo />
        </a>
        <ul id="lp-menu" className={open ? 'open' : undefined} onClick={() => setOpen(false)}>
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
        <div className="acts">
          <a className="btn btn-s" href="/signin">
            Entrar
          </a>
          <a className="btn btn-p" href="/signup">
            Criar conta
          </a>
          <button
            type="button"
            className="burger"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-controls="lp-menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span />
          </button>
        </div>
      </div>
    </header>
  );
}
