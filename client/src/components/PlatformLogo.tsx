import { useTheme } from '../theme/ThemeContext';
import './PlatformLogo.css';

export function PlatformLogo({
  className = '',
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  const { isDark } = useTheme();
  const src = isDark ? '/eclesiafy-logo-dark.png' : '/eclesiafy-logo-light.png';
  return (
    <img
      src={src}
      alt={decorative ? '' : 'Eclesiafy'}
      className={`platform-logo ${className}`.trim()}
      aria-hidden={decorative ? 'true' : undefined}
    />
  );
}
