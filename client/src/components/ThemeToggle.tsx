import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeContext';
import './ThemeToggle.css';

interface Props {
  compact?: boolean;
  label?: string;
  tabIndex?: number;
}

export function ThemeToggle({ compact = false, label, tabIndex }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      aria-label={label || (isDark ? 'Ativar tema claro' : 'Ativar tema escuro')}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      tabIndex={tabIndex}
    >
      <AppIcon name={isDark ? 'sun' : 'moon'} />
      {!compact && <span>{label || (isDark ? 'Claro' : 'Escuro')}</span>}
    </button>
  );
}
