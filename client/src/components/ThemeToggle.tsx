import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeContext';
import './ThemeToggle.css';

interface Props {
  compact?: boolean;
}

export function ThemeToggle({ compact = false }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
    >
      <AppIcon name={isDark ? 'sun' : 'moon'} />
      {!compact && <span>{isDark ? 'Claro' : 'Escuro'}</span>}
    </button>
  );
}
